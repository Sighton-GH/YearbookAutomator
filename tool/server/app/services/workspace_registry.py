from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from app.services.admin_settings import get_face_detection_settings
from app.services.storage import (
    DEFAULT_SESSION_TTL_SECONDS,
    delete_workspace,
    list_workspace_ids,
    new_workspace_id,
    read_workspace_meta,
    touch_workspace,
    workspace_path,
)

LicenseType = Literal["personal", "commercial"]


@dataclass(frozen=True)
class ResolveResult:
    ok: bool
    workspace_id: str | None
    license_type: LicenseType
    created_new: bool
    recreated_after_expiry: bool
    lock_conflict: bool
    lock_expires_at: int | None = None
    lock_holder_device_id: str | None = None


_STORE_LOCK = Lock()


def _root_dir() -> Path:
    from app.services.licensing import _licenses_root  # reuse licensing storage root

    return _licenses_root()


def _registry_path() -> Path:
    return _root_dir() / "workspace_registry.json"


def _audit_path() -> Path:
    return _root_dir() / "workspace_audit.json"


def _ensure_dir() -> None:
    _root_dir().mkdir(parents=True, exist_ok=True)


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            return loaded
    except Exception:
        pass
    return default


def _save_json(path: Path, data: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    try:
        tmp.chmod(0o600)
    except OSError:
        pass
    tmp.replace(path)


def _load_registry() -> dict[str, Any]:
    _ensure_dir()
    store = _load_json(_registry_path(), {"version": 1, "bindings": []})
    if not isinstance(store.get("bindings"), list):
        store["bindings"] = []
    return store


def _save_registry(store: dict[str, Any]) -> None:
    _ensure_dir()
    _save_json(_registry_path(), store)


def _load_audit() -> list[dict[str, Any]]:
    _ensure_dir()
    data = _load_json(_audit_path(), {"events": []})
    events = data.get("events")
    return events if isinstance(events, list) else []


def _save_audit(events: list[dict[str, Any]]) -> None:
    _ensure_dir()
    _save_json(_audit_path(), {"events": events})


def _audit(event_type: str, *, workspace_id: str | None, license_type: LicenseType | str, device_id: str | None, detail: str = "") -> None:
    now = int(time.time())
    with _STORE_LOCK:
        events = _load_audit()
        events.append(
            {
                "ts": now,
                "event": event_type,
                "workspace_id": workspace_id,
                "license_type": license_type,
                "device_id": device_id,
                "detail": detail,
            }
        )
        settings = get_face_detection_settings()
        keep_days = max(1, int(settings.workspace_audit_retention_days))
        cutoff = now - (keep_days * 24 * 60 * 60)
        events = [e for e in events if int(e.get("ts") or 0) >= cutoff]
        if len(events) > 5000:
            events = events[-5000:]
        _save_audit(events)


def recent_audit(limit: int = 200) -> list[dict[str, Any]]:
    with _STORE_LOCK:
        events = _load_audit()
        if limit <= 0:
            return []
        return list(reversed(events[-min(limit, len(events)) :]))


def _owner_key(license_key: str, license_type: LicenseType, device_id: str | None) -> str:
    key = (license_key or "").strip().upper()
    settings = get_face_detection_settings()
    mode = (settings.commercial_workspace_key_mode or "license_only").strip().lower()
    if license_type == "personal":
        dev = (device_id or "").strip()
        return f"pers:{key}:{dev}"
    if mode == "license_and_device":
        dev = (device_id or "").strip()
        return f"comm:{key}:{dev}"
    return f"comm:{key}"


def _find_binding(bindings: list[dict[str, Any]], owner_key: str) -> dict[str, Any] | None:
    for b in bindings:
        if str(b.get("owner_key") or "") == owner_key:
            return b
    return None


def _binding_by_workspace(bindings: list[dict[str, Any]], workspace_id: str) -> dict[str, Any] | None:
    for b in bindings:
        if str(b.get("workspace_id") or "") == workspace_id:
            return b
    return None


def _resolve_ttl_policy(license_key: str, license_type: LicenseType) -> tuple[int, bool]:
    """Return `(ttl_seconds, expiry_disabled)` for a given license.

    Commercial licenses use their per-license override (set in the admin
    Licenses page); personal licenses always use the dedicated
    `personal_workspace_timeout_seconds` admin setting.
    """
    if license_type == "commercial":
        from app.services.licensing import DEFAULT_COMMERCIAL_WORKSPACE_EXPIRY_SECONDS, get_workspace_expiry_policy

        disabled, custom_seconds = get_workspace_expiry_policy(license_key)
        if disabled:
            return 0, True
        ttl = int(custom_seconds) if custom_seconds else DEFAULT_COMMERCIAL_WORKSPACE_EXPIRY_SECONDS
        return max(60, ttl), False

    settings = get_face_detection_settings()
    try:
        return max(60, int(settings.personal_workspace_timeout_seconds)), False
    except Exception:
        return DEFAULT_SESSION_TTL_SECONDS, False


def _current_lock_timeout_seconds() -> int:
    settings = get_face_detection_settings()
    try:
        return max(30, int(settings.workspace_lock_timeout_seconds))
    except Exception:
        return 120


def _lock_owner_matches(lock: dict[str, Any], *, device_id: str | None, session_id: str | None) -> bool:
    lock_device = str(lock.get("device_id") or "").strip()
    lock_session = str(lock.get("session_id") or "").strip()
    incoming_device = (device_id or "").strip()
    incoming_session = (session_id or "").strip()
    if lock_device and incoming_device and lock_device == incoming_device:
        return True
    if lock_session and incoming_session and lock_session == incoming_session:
        return True
    return False


def _acquire_lock(binding: dict[str, Any], *, device_id: str | None, session_id: str | None, now: int) -> None:
    timeout = _current_lock_timeout_seconds()
    binding["lock"] = {
        "device_id": (device_id or "").strip() or None,
        "session_id": (session_id or "").strip() or None,
        "acquired_at": now,
        "last_heartbeat_at": now,
        "expires_at": now + timeout,
    }


def resolve_workspace(
    *,
    license_key: str,
    license_type: LicenseType,
    device_id: str | None,
    session_id: str | None,
) -> ResolveResult:
    now = int(time.time())
    owner_key = _owner_key(license_key, license_type, device_id)
    ttl, expiry_disabled = _resolve_ttl_policy(license_key, license_type)

    with _STORE_LOCK:
        store = _load_registry()
        bindings = store["bindings"]
        binding = _find_binding(bindings, owner_key)

        recreated_after_expiry = False
        created_new = False

        if binding is not None:
            wid_existing = str(binding.get("workspace_id") or "")
            if not wid_existing or not workspace_path(wid_existing).exists():
                bindings.remove(binding)
                binding = None

        if binding is not None:
            exp = int(binding.get("expires_at") or 0)
            if exp > 0 and now >= exp:
                wid_expired = str(binding.get("workspace_id") or "")
                if wid_expired:
                    delete_workspace(wid_expired)
                bindings.remove(binding)
                binding = None
                recreated_after_expiry = True

        if binding is None:
            created_new = True
            workspace_id = new_workspace_id()
            expires_at = 0 if expiry_disabled else now + ttl
            touch_workspace(
                workspace_id,
                session_id=(session_id or None),
                started_at_ms=now * 1000,
                expires_at_ms=None if expiry_disabled else expires_at * 1000,
                ttl_seconds=ttl,
                expiry_disabled=expiry_disabled,
            )
            binding = {
                "owner_key": owner_key,
                "workspace_id": workspace_id,
                "license_type": license_type,
                "created_at": now,
                "last_seen": now,
                "expires_at": expires_at,
                "ttl_seconds": ttl,
                "expiry_disabled": expiry_disabled,
                "lock": None,
            }
            bindings.append(binding)
        else:
            # Refresh the cached policy in case the admin changed the license's
            # expiry settings since this binding was created.
            binding["ttl_seconds"] = ttl
            binding["expiry_disabled"] = expiry_disabled

        workspace_id = str(binding.get("workspace_id"))

        if license_type == "commercial":
            lock = binding.get("lock") if isinstance(binding.get("lock"), dict) else None
            lock_active = False
            if lock:
                lock_exp = int(lock.get("expires_at") or 0)
                lock_active = lock_exp > now

            if lock and lock_active and not _lock_owner_matches(lock, device_id=device_id, session_id=session_id):
                _save_registry(store)
                return ResolveResult(
                    ok=False,
                    workspace_id=workspace_id,
                    license_type=license_type,
                    created_new=False,
                    recreated_after_expiry=False,
                    lock_conflict=True,
                    lock_expires_at=int(lock.get("expires_at") or 0) or None,
                    lock_holder_device_id=str(lock.get("device_id") or "") or None,
                )

            _acquire_lock(binding, device_id=device_id, session_id=session_id, now=now)

        binding["last_seen"] = now
        binding["expires_at"] = 0 if expiry_disabled else now + ttl
        touch_workspace(
            workspace_id,
            session_id=(session_id or None),
            started_at_ms=now * 1000,
            expires_at_ms=None if expiry_disabled else (now + ttl) * 1000,
            ttl_seconds=ttl,
            expiry_disabled=expiry_disabled,
        )
        _save_registry(store)

    if created_new:
        _audit("workspace_created", workspace_id=workspace_id, license_type=license_type, device_id=device_id)
    elif recreated_after_expiry:
        _audit("workspace_recreated_after_expiry", workspace_id=workspace_id, license_type=license_type, device_id=device_id)
    else:
        _audit("workspace_resumed", workspace_id=workspace_id, license_type=license_type, device_id=device_id)

    return ResolveResult(
        ok=True,
        workspace_id=workspace_id,
        license_type=license_type,
        created_new=created_new,
        recreated_after_expiry=recreated_after_expiry,
        lock_conflict=False,
    )


def heartbeat_workspace(
    *,
    workspace_id: str,
    license_type: LicenseType,
    device_id: str | None,
    session_id: str | None,
    started_at_ms: int | None = None,
    expires_at_ms: int | None = None,
) -> tuple[bool, str | None]:
    now = int(time.time())
    with _STORE_LOCK:
        store = _load_registry()
        bindings = store["bindings"]
        binding = _binding_by_workspace(bindings, workspace_id)
        if binding is None:
            return False, "workspace_not_registered"

        if license_type == "commercial":
            lock = binding.get("lock") if isinstance(binding.get("lock"), dict) else None
            if not lock:
                return False, "workspace_not_checked_out"
            lock_exp = int(lock.get("expires_at") or 0)
            if lock_exp <= now:
                return False, "workspace_lock_expired"
            if not _lock_owner_matches(lock, device_id=device_id, session_id=session_id):
                return False, "workspace_locked"
            timeout = _current_lock_timeout_seconds()
            lock["last_heartbeat_at"] = now
            lock["expires_at"] = now + timeout
            binding["lock"] = lock

        # Reuse the ttl/disabled policy cached on the binding at resolve-time,
        # rather than re-reading the license store on every heartbeat.
        ttl = int(binding.get("ttl_seconds") or 0) or DEFAULT_SESSION_TTL_SECONDS
        expiry_disabled = bool(binding.get("expiry_disabled", False))
        binding["last_seen"] = now
        binding["expires_at"] = 0 if expiry_disabled else now + ttl
        _save_registry(store)

    touch_workspace(
        workspace_id,
        session_id=session_id,
        started_at_ms=started_at_ms,
        expires_at_ms=None if expiry_disabled else expires_at_ms,
        ttl_seconds=ttl,
        expiry_disabled=expiry_disabled,
    )
    return True, None


def release_workspace(*, workspace_id: str, license_type: LicenseType, device_id: str | None, session_id: str | None) -> tuple[bool, str | None]:
    if license_type != "commercial":
        return True, None

    with _STORE_LOCK:
        store = _load_registry()
        bindings = store["bindings"]
        binding = _binding_by_workspace(bindings, workspace_id)
        if binding is None:
            return False, "workspace_not_registered"

        lock = binding.get("lock") if isinstance(binding.get("lock"), dict) else None
        if not lock:
            return True, None
        if not _lock_owner_matches(lock, device_id=device_id, session_id=session_id):
            return False, "workspace_locked"
        binding["lock"] = None
        _save_registry(store)

    _audit("workspace_released", workspace_id=workspace_id, license_type=license_type, device_id=device_id)
    return True, None


def license_takeover_workspace(*, workspace_id: str, license_key: str, license_type: LicenseType,
                               device_id: str | None, session_id: str | None) -> tuple[bool, str | None]:
    """Allow only the authenticated commercial owner to move their own lock.

    Ownership and lock replacement share the registry mutex. Admin takeover
    remains separately authenticated and subject to its existing setting.
    """
    if license_type != "commercial":
        return False, "takeover_not_allowed_for_license_type"
    now = int(time.time())
    expected_owner = _owner_key(license_key, license_type, device_id)
    with _STORE_LOCK:
        store = _load_registry()
        binding = _binding_by_workspace(store["bindings"], workspace_id)
        if binding is None:
            return False, "workspace_not_registered"
        if str(binding.get("owner_key") or "") != expected_owner:
            return False, "workspace_owner_mismatch"
        expires_at = int(binding.get("expires_at") or 0)
        if expires_at > 0 and expires_at <= now:
            return False, "workspace_expired"
        _acquire_lock(binding, device_id=device_id, session_id=session_id, now=now)
        _save_registry(store)
    _audit("workspace_owner_takeover", workspace_id=workspace_id, license_type="commercial", device_id=device_id)
    return True, None


def admin_takeover_workspace(*, workspace_id: str, device_id: str | None, session_id: str | None) -> tuple[bool, str | None]:
    settings = get_face_detection_settings()
    if not bool(settings.enable_admin_workspace_takeover):
        return False, "admin_takeover_disabled"

    now = int(time.time())
    with _STORE_LOCK:
        store = _load_registry()
        bindings = store["bindings"]
        binding = _binding_by_workspace(bindings, workspace_id)
        if binding is None:
            return False, "workspace_not_registered"
        if str(binding.get("license_type") or "") != "commercial":
            return False, "takeover_not_allowed_for_license_type"

        _acquire_lock(binding, device_id=device_id, session_id=session_id, now=now)
        _save_registry(store)

    _audit("workspace_taken_over", workspace_id=workspace_id, license_type="commercial", device_id=device_id)
    return True, None


def unregister_workspace(workspace_id: str) -> None:
    with _STORE_LOCK:
        store = _load_registry()
        bindings = store["bindings"]
        new_bindings = [b for b in bindings if str(b.get("workspace_id") or "") != workspace_id]
        if len(new_bindings) == len(bindings):
            return
        store["bindings"] = new_bindings
        _save_registry(store)


def active_locks() -> list[dict[str, Any]]:
    now = int(time.time())
    with _STORE_LOCK:
        store = _load_registry()
        out: list[dict[str, Any]] = []
        for binding in store.get("bindings", []):
            if str(binding.get("license_type") or "") != "commercial":
                continue
            lock = binding.get("lock") if isinstance(binding.get("lock"), dict) else None
            if not lock:
                continue
            expires_at = int(lock.get("expires_at") or 0)
            if expires_at <= now:
                continue
            out.append(
                {
                    "workspace_id": str(binding.get("workspace_id") or ""),
                    "device_id": str(lock.get("device_id") or "") or None,
                    "session_id": str(lock.get("session_id") or "") or None,
                    "acquired_at": int(lock.get("acquired_at") or 0) or None,
                    "last_heartbeat_at": int(lock.get("last_heartbeat_at") or 0) or None,
                    "expires_at": expires_at,
                }
            )
        return out


def ensure_workspace_write_access(
    *,
    workspace_id: str,
    license_key: str,
    license_type: LicenseType,
    device_id: str | None,
    session_id: str | None,
) -> tuple[bool, str | None]:
    """Enforce ownership/checkout rules for mutating operations.

    Returns (ok, reason). For commercial licenses this requires an active
    checkout lock owned by the caller.
    """

    now = int(time.time())
    emit_legacy_bind_audit = False
    with _STORE_LOCK:
        store = _load_registry()
        bindings = store.get("bindings", [])
        binding = _binding_by_workspace(bindings, workspace_id)
        if binding is None:
            # Backwards compatibility for legacy flows that predate /resolve.
            # Lazily register the workspace to the current owner and, for
            # commercial keys, acquire a lock owned by the caller.
            allow_legacy_binding = (os.getenv("YMGA_ALLOW_LEGACY_WORKSPACE_BINDING", "false") or "false").strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }
            if not allow_legacy_binding:
                return False, "workspace_not_registered"
            expected_owner = _owner_key(license_key, license_type, device_id)
            ttl, expiry_disabled = _resolve_ttl_policy(license_key, license_type)
            touch_workspace(workspace_id, session_id=session_id, ttl_seconds=ttl, expiry_disabled=expiry_disabled)
            binding = {
                "owner_key": expected_owner,
                "workspace_id": workspace_id,
                "license_type": license_type,
                "created_at": now,
                "last_seen": now,
                "expires_at": 0 if expiry_disabled else now + ttl,
                "ttl_seconds": ttl,
                "expiry_disabled": expiry_disabled,
                "lock": None,
            }
            if license_type == "commercial":
                _acquire_lock(binding, device_id=device_id, session_id=session_id, now=now)
            bindings.append(binding)
            _save_registry(store)
            emit_legacy_bind_audit = True
        else:
            expected_owner = _owner_key(license_key, license_type, device_id)
            actual_owner = str(binding.get("owner_key") or "")
            if expected_owner != actual_owner:
                return False, "workspace_owner_mismatch"

    if emit_legacy_bind_audit:
        _audit("workspace_legacy_bound", workspace_id=workspace_id, license_type=license_type, device_id=device_id)
        return True, None

    hb_ok, hb_reason = heartbeat_workspace(
        workspace_id=workspace_id,
        license_type=license_type,
        device_id=device_id,
        session_id=session_id,
    )
    if not hb_ok:
        return False, hb_reason
    return True, None


def ensure_workspace_read_access(
    *,
    workspace_id: str,
    license_key: str,
    license_type: LicenseType,
    device_id: str | None,
) -> tuple[bool, str | None]:
    """Require a workspace to belong to the authenticated license/device."""
    now = int(time.time())
    expected_owner = _owner_key(license_key, license_type, device_id)
    with _STORE_LOCK:
        store = _load_registry()
        binding = _binding_by_workspace(store.get("bindings", []), workspace_id)
        if binding is None:
            return False, "workspace_not_registered"
        if str(binding.get("owner_key") or "") != expected_owner:
            return False, "workspace_owner_mismatch"
        expires_at = int(binding.get("expires_at") or 0)
        if expires_at > 0 and expires_at <= now:
            return False, "workspace_expired"
    return True, None


def _mask_license_key(key: str) -> str | None:
    key = (key or "").strip()
    if not key:
        return None
    if len(key) <= 14:
        return key
    return f"{key[:10]}…{key[-4:]}"


def _owner_key_display(owner_key: str) -> tuple[str | None, str | None]:
    """Best-effort split of an internal `owner_key` into (masked_key, device_id).

    `owner_key` is formatted as `pers:<KEY>:<device>`, `comm:<KEY>:<device>`, or
    `comm:<KEY>` (see `_owner_key`).
    """

    parts = (owner_key or "").split(":")
    if len(parts) >= 2:
        device = parts[2] if len(parts) >= 3 and parts[2] else None
        return _mask_license_key(parts[1]), device
    return _mask_license_key(owner_key), None


def _workspace_disk_usage_bytes(workspace_id: str) -> int:
    try:
        root = workspace_path(workspace_id)
        if not root.exists():
            return 0
        total = 0
        for p in root.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    continue
        return total
    except Exception:
        return 0


def list_all_sessions_detailed() -> list[dict[str, Any]]:
    """Rich per-workspace session info for the admin dashboard.

    Includes every registered binding plus any on-disk workspace directories
    that have no (or no longer have a) registry binding, so nothing active is
    hidden from the admin. Newest activity first.
    """

    now = int(time.time())
    with _STORE_LOCK:
        store = _load_registry()
        bindings = [dict(b) for b in store.get("bindings", [])]

    known_ids = {str(b.get("workspace_id") or "") for b in bindings}
    out: list[dict[str, Any]] = []

    for b in bindings:
        workspace_id = str(b.get("workspace_id") or "")
        masked_key, device_id = _owner_key_display(str(b.get("owner_key") or ""))
        expires_at = int(b.get("expires_at") or 0)
        lock = b.get("lock") if isinstance(b.get("lock"), dict) else None
        lock_active = bool(lock and int(lock.get("expires_at") or 0) > now)
        on_disk = bool(workspace_id) and workspace_path(workspace_id).exists()

        out.append(
            {
                "workspace_id": workspace_id,
                "license_type": b.get("license_type", "personal"),
                "masked_license_key": masked_key,
                "device_id": device_id,
                "created_at": int(b.get("created_at") or 0),
                "last_seen": int(b.get("last_seen") or 0),
                "expires_at": expires_at,
                "seconds_until_expiry": max(0, expires_at - now),
                "on_disk": on_disk,
                "is_stale": not on_disk,
                "locked": lock_active,
                "lock_device_id": (lock.get("device_id") if lock_active else None),
                "lock_expires_at": (int(lock.get("expires_at") or 0) if lock_active else None),
                "disk_bytes": _workspace_disk_usage_bytes(workspace_id) if on_disk else 0,
                "expiry_disabled": bool(b.get("expiry_disabled", False)),
            }
        )

    try:
        for workspace_id in list_workspace_ids():
            if workspace_id in known_ids:
                continue
            meta = read_workspace_meta(workspace_id)
            last_seen = float(meta.get("last_seen") or 0)
            session_expires_at = meta.get("session_expires_at")
            expires_at = int(session_expires_at) if session_expires_at else 0
            out.append(
                {
                    "workspace_id": workspace_id,
                    "license_type": "unknown",
                    "masked_license_key": None,
                    "device_id": None,
                    "created_at": int(last_seen),
                    "last_seen": int(last_seen),
                    "expires_at": expires_at,
                    "seconds_until_expiry": max(0, expires_at - now),
                    "on_disk": True,
                    "is_stale": False,
                    "locked": False,
                    "lock_device_id": None,
                    "lock_expires_at": None,
                    "disk_bytes": _workspace_disk_usage_bytes(workspace_id),
                    "expiry_disabled": bool(meta.get("workspace_expiry_disabled", False)),
                }
            )
    except Exception:
        pass

    out.sort(key=lambda r: r.get("last_seen", 0), reverse=True)
    return out


def prune_stale_bindings() -> int:
    """Remove registry bindings whose workspace no longer exists on disk.

    Returns the number of bindings removed.
    """

    removed = 0
    with _STORE_LOCK:
        store = _load_registry()
        bindings = store.get("bindings", [])
        kept = []
        for b in bindings:
            wid = str(b.get("workspace_id") or "")
            if wid and workspace_path(wid).exists():
                kept.append(b)
            else:
                removed += 1
        if removed:
            store["bindings"] = kept
            _save_registry(store)

    if removed:
        _audit("stale_bindings_pruned", workspace_id=None, license_type="system", device_id=None, detail=f"removed={removed}")
    return removed


def admin_force_release_lock(workspace_id: str) -> tuple[bool, str | None]:
    """Admin-only: unconditionally clear a commercial workspace's checkout lock.

    Unlike `admin_takeover_workspace`, this does not reassign the lock to the
    caller — it simply frees the workspace for the next caller immediately.
    """

    with _STORE_LOCK:
        store = _load_registry()
        bindings = store.get("bindings", [])
        binding = _binding_by_workspace(bindings, workspace_id)
        if binding is None:
            return False, "workspace_not_registered"
        if binding.get("lock") is None:
            return True, None
        binding["lock"] = None
        _save_registry(store)

    _audit("workspace_lock_force_released", workspace_id=workspace_id, license_type="commercial", device_id=None)
    return True, None
