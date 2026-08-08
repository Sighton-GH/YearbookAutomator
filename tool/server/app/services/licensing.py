import base64
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from app.services.storage import BASE_DATA


LicenseType = Literal["personal", "commercial"]

# Default workspace-session TTL for a commercial license with no per-license
# override set. Matches the historical global default (8h); each module in
# this codebase keeps its own copy of this constant rather than importing it.
DEFAULT_COMMERCIAL_WORKSPACE_EXPIRY_SECONDS = 8 * 60 * 60


class LicenseError(Exception):
    pass


@dataclass(frozen=True)
class LicenseRecord:
    key: str | None
    key_hash: str | None
    license_type: LicenseType
    issued_at: int
    expires_at: int | None
    revoked: bool
    note: str | None
    uses: int
    max_uses: int | None
    last_used_at: int | None
    bound_ip: str | None
    bound_device_id: str | None
    monthly_uses: dict[str, int]
    monthly_limit: int | None
    unlock_all_steps: bool
    workspace_expiry_disabled: bool
    workspace_expiry_seconds: int | None
    last_seen_ip: str | None
    last_seen_device_id: str | None


# Sentinel to distinguish "field not provided" from "field explicitly cleared to None"
# in update_license's kwargs.
_UNSET = object()


_STORE_LOCK = Lock()


def _is_loopback_ip(ip: str | None) -> bool:
    if not ip:
        return False
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return False


def _loopback_equivalent(a: str | None, b: str | None) -> bool:
    # Treat 127.0.0.1 and ::1 as equivalent for local/dev.
    return _is_loopback_ip(a) and _is_loopback_ip(b)


def _ip_binding_allows(bound_ip: str | None, current_ip: str | None) -> bool:
    """Return True if current_ip satisfies the stored binding.

    - If no binding exists, allow.
    - If binding exists, require a current ip and match it.
    - Special-case: any loopback ip matches any other loopback ip.
    """

    if not bound_ip:
        return True
    if not current_ip:
        return False
    return bound_ip == current_ip or _loopback_equivalent(bound_ip, current_ip)


def _ip_binding_same(bound_ip: str | None, current_ip: str | None) -> bool:
    """Stricter equality for matching an existing bound personal license record."""

    if bound_ip is None and current_ip is None:
        return True
    if bound_ip is None or current_ip is None:
        return False
    return bound_ip == current_ip or _loopback_equivalent(bound_ip, current_ip)


def personal_monthly_limit_default() -> int:
    raw = os.getenv("YMGA_PERSONAL_MONTHLY_LIMIT", "5").strip()
    try:
        v = int(raw)
        return v if v > 0 else 5
    except ValueError:
        return 5


def _month_bucket(ts: int) -> str:
    t = time.gmtime(ts)
    return f"{t.tm_year:04d}-{t.tm_mon:02d}"


def _licenses_root() -> Path:
    override = os.getenv("YMGA_LICENSE_STORE_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return BASE_DATA / "_licenses"


def _ensure_dir() -> None:
    root = _licenses_root()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass


def _store_path() -> Path:
    return _licenses_root() / "licenses.json"


def _secret_path() -> Path:
    return _licenses_root() / "secret.txt"


def _read_secret() -> bytes:
    env = os.getenv("YMGA_LICENSE_SECRET", "").strip()
    if env:
        return env.encode("utf-8")

    _ensure_dir()
    p = _secret_path()
    if p.exists():
        raw = p.read_text(encoding="utf-8").strip()
        if raw:
            return raw.encode("utf-8")

    secret = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")
    p.write_text(secret, encoding="utf-8")
    try:
        p.chmod(0o600)
    except OSError:
        pass
    return secret.encode("utf-8")


def _key_hash(license_key: str) -> str:
    secret = _read_secret()
    normalized = (license_key or "").strip().upper()
    return hmac.new(secret, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def _load_store() -> dict[str, Any]:
    _ensure_dir()
    path = _store_path()
    if not path.exists():
        return {"version": 2, "licenses": []}
    try:
        store = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(store, dict):
            return {"version": 2, "licenses": []}
        store.setdefault("version", 2)
        store.setdefault("licenses", [])
        return store
    except Exception as e:
        raise LicenseError(f"Could not read license store: {e}")


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    try:
        tmp.chmod(0o600)
    except OSError:
        pass
    tmp.replace(path)


def _dump_store(store: dict[str, Any]) -> None:
    _ensure_dir()
    _atomic_write_json(_store_path(), store)


def _format_key(raw: bytes) -> str:
    token = base64.b32encode(raw).decode("ascii").rstrip("=")
    groups = [token[i : i + 5] for i in range(0, len(token), 5)]
    return "YMGA1-" + "-".join(groups)


def generate_license_key() -> str:
    return _format_key(secrets.token_bytes(32))


def create_license(
    *,
    license_type: LicenseType,
    expires_at: int | None = None,
    max_uses: int | None = None,
    bound_ip: str | None = None,
    bound_device_id: str | None = None,
    monthly_limit: int | None = None,
    note: str | None = None,
    unlock_all_steps: bool = False,
    workspace_expiry_disabled: bool = False,
    workspace_expiry_seconds: int | None = None,
) -> str:
    license_key = generate_license_key().strip().upper()
    now = int(time.time())
    if license_type == "personal" and monthly_limit is None:
        monthly_limit = personal_monthly_limit_default()

    record = {
        "key": license_key,
        "license_type": license_type,
        "issued_at": now,
        "expires_at": expires_at,
        "revoked": False,
        "note": note,
        "uses": 0,
        "max_uses": max_uses,
        "last_used_at": None,
        "bound_ip": bound_ip,
        "bound_device_id": bound_device_id,
        "monthly_limit": monthly_limit,
        "monthly_uses": {},
        "unlock_all_steps": bool(unlock_all_steps),
        "workspace_expiry_disabled": bool(workspace_expiry_disabled),
        "workspace_expiry_seconds": int(workspace_expiry_seconds) if workspace_expiry_seconds else None,
        "last_seen_ip": None,
        "last_seen_device_id": None,
    }

    with _STORE_LOCK:
        store = _load_store()
        store.setdefault("licenses", [])
        store["licenses"].append(record)
        _dump_store(store)

    return license_key


def create_personal_license(*, ip: str | None, device_id: str | None, note: str | None = None) -> str:
    return create_license(
        license_type="personal",
        bound_ip=ip,
        bound_device_id=device_id,
        monthly_limit=personal_monthly_limit_default(),
        note=note,
    )


def get_or_create_personal_license(*, ip: str | None, device_id: str | None, note: str | None = None) -> str:
    """Return an existing active personal license for this binding, or create one.

    This prevents bypassing per-month limits by requesting infinite new keys.
    """

    with _STORE_LOCK:
        store = _load_store()
        candidates: list[dict[str, Any]] = []
        for rec in store.get("licenses", []):
            if rec.get("license_type") != "personal":
                continue
            if rec.get("revoked", False):
                continue
            if rec.get("key") is None:
                continue
            if not _ip_binding_same(rec.get("bound_ip", None), ip):
                continue
            if rec.get("bound_device_id", None) != device_id:
                continue
            candidates.append(rec)

        if candidates:
            # Prefer most recently issued.
            candidates.sort(key=lambda r: int(r.get("issued_at", 0) or 0), reverse=True)
            return str(candidates[0]["key"]).strip().upper()

    return create_personal_license(ip=ip, device_id=device_id, note=note)


def delete_license(license_key: str) -> bool:
    """Admin-only: permanently remove a license record from the store.

    Unlike `revoke_license`, this is irreversible and drops all history (uses,
    bindings, notes) for the key. Matches by full key or legacy key_hash.
    """

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return False
    key_hash = _key_hash(key_norm)

    with _STORE_LOCK:
        store = _load_store()
        licenses: list[dict[str, Any]] = store.get("licenses", [])
        remaining = [rec for rec in licenses if not _matches_record(rec, key=key_norm, key_hash=key_hash)]
        changed = len(remaining) != len(licenses)
        if changed:
            store["licenses"] = remaining
            _dump_store(store)
    return changed


def update_license(
    license_key: str,
    *,
    note: Any = _UNSET,
    expires_at: Any = _UNSET,
    max_uses: Any = _UNSET,
    monthly_limit: Any = _UNSET,
) -> bool:
    """Admin-only: edit editable metadata on an existing license.

    Any kwarg left as the default (`_UNSET`) is left untouched. Passing `None`
    explicitly clears that field (e.g. `expires_at=None` removes an expiry).
    """

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return False

    changed = False
    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            rec_key = (rec.get("key") or "").strip().upper()
            if not (rec_key and rec_key == key_norm):
                continue
            if note is not _UNSET:
                normalized_note = (note or "").strip() or None
                if rec.get("note") != normalized_note:
                    rec["note"] = normalized_note
                    changed = True
            if expires_at is not _UNSET:
                normalized_expires = int(expires_at) if expires_at is not None else None
                if rec.get("expires_at") != normalized_expires:
                    rec["expires_at"] = normalized_expires
                    changed = True
            if max_uses is not _UNSET:
                normalized_max_uses = int(max_uses) if max_uses is not None else None
                if rec.get("max_uses") != normalized_max_uses:
                    rec["max_uses"] = normalized_max_uses
                    changed = True
            if monthly_limit is not _UNSET:
                normalized_monthly_limit = int(monthly_limit) if monthly_limit is not None else None
                if rec.get("monthly_limit") != normalized_monthly_limit:
                    rec["monthly_limit"] = normalized_monthly_limit
                    changed = True
        if changed:
            _dump_store(store)
    return changed


def record_license_seen(license_key: str, *, ip: str | None, device_id: str | None) -> None:
    """Update `last_used_at`/`last_seen_ip`/`last_seen_device_id` for any validated request.

    Unlike `validate_and_record_use`, this never touches `uses` or monthly counters —
    it exists purely so the admin panel's "last used" column reflects real activity
    (browsing/uploading), not only completed generations. Writes are throttled to
    once per 30s per key so routine polling doesn't hammer the JSON store.
    """

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return
    key_hash = _key_hash(key_norm)
    now = int(time.time())

    with _STORE_LOCK:
        store = _load_store()
        changed = False
        for rec in store.get("licenses", []):
            if not _matches_record(rec, key=key_norm, key_hash=key_hash):
                continue
            last_used_at = rec.get("last_used_at") or 0
            ip_changed = bool(ip) and rec.get("last_seen_ip") != ip
            device_changed = bool(device_id) and rec.get("last_seen_device_id") != device_id
            if (now - int(last_used_at)) < 30 and not ip_changed and not device_changed:
                return
            rec["last_used_at"] = now
            if ip:
                rec["last_seen_ip"] = ip
            if device_id:
                rec["last_seen_device_id"] = device_id
            changed = True
            break
        if changed:
            _dump_store(store)


def revoke_license(license_key: str) -> bool:
    key_norm = (license_key or "").strip().upper()
    key_hash = _key_hash(key_norm)
    changed = False

    with _STORE_LOCK:
        store = _load_store()
        licenses: list[dict[str, Any]] = store.get("licenses", [])
        for rec in licenses:
            rec_key = (rec.get("key") or "").strip().upper()
            rec_hash = rec.get("key_hash")
            matches = (rec_key and rec_key == key_norm) or (rec_hash and rec_hash == key_hash)
            if matches and not rec.get("revoked", False):
                rec["revoked"] = True
                changed = True
        if changed:
            _dump_store(store)
    return changed


def list_licenses() -> list[LicenseRecord]:
    with _STORE_LOCK:
        store = _load_store()
        out: list[LicenseRecord] = []
        for rec in store.get("licenses", []):
            out.append(
                LicenseRecord(
                    key=rec.get("key", None),
                    key_hash=rec.get("key_hash", None),
                    license_type=rec.get("license_type", "personal"),
                    issued_at=int(rec.get("issued_at", 0) or 0),
                    expires_at=rec.get("expires_at", None),
                    revoked=bool(rec.get("revoked", False)),
                    note=rec.get("note", None),
                    uses=int(rec.get("uses", 0) or 0),
                    max_uses=rec.get("max_uses", None),
                    last_used_at=rec.get("last_used_at", None),
                    bound_ip=rec.get("bound_ip", None),
                    bound_device_id=rec.get("bound_device_id", None),
                    monthly_uses=(rec.get("monthly_uses", {}) or {}),
                    monthly_limit=rec.get("monthly_limit", None),
                    unlock_all_steps=bool(rec.get("unlock_all_steps", False)),
                    workspace_expiry_disabled=bool(rec.get("workspace_expiry_disabled", False)),
                    workspace_expiry_seconds=rec.get("workspace_expiry_seconds", None),
                    last_seen_ip=rec.get("last_seen_ip", None),
                    last_seen_device_id=rec.get("last_seen_device_id", None),
                )
            )
        return out


def set_license_unlock_all_steps(license_key: str, *, enabled: bool) -> bool:
    """Admin-only: toggle the per-license unlock_all_steps flag."""

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return False

    changed = False
    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            rec_key = (rec.get("key") or "").strip().upper()
            if rec_key and rec_key == key_norm:
                if bool(rec.get("unlock_all_steps", False)) != bool(enabled):
                    rec["unlock_all_steps"] = bool(enabled)
                    changed = True
        if changed:
            _dump_store(store)
    return changed


def set_license_workspace_expiry(license_key: str, *, disabled: bool, seconds: int | None) -> bool:
    """Admin-only: set a commercial license's per-license workspace-session expiry override.

    `seconds=None` clears any custom duration (falls back to the default). Meaningless
    for personal licenses, but not blocked here — the caller (admin UI) restricts this
    to commercial rows.
    """

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return False

    normalized_seconds = int(seconds) if seconds else None

    changed = False
    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            rec_key = (rec.get("key") or "").strip().upper()
            if rec_key and rec_key == key_norm:
                if bool(rec.get("workspace_expiry_disabled", False)) != bool(disabled):
                    rec["workspace_expiry_disabled"] = bool(disabled)
                    changed = True
                if rec.get("workspace_expiry_seconds", None) != normalized_seconds:
                    rec["workspace_expiry_seconds"] = normalized_seconds
                    changed = True
        if changed:
            _dump_store(store)
    return changed


def get_workspace_expiry_policy(license_key: str) -> tuple[bool, int | None]:
    """Return `(expiry_disabled, custom_seconds)` for a commercial license.

    `(False, None)` if the license isn't found or has no override set (i.e. use the
    default commercial workspace-session TTL).
    """

    key_norm = (license_key or "").strip().upper()
    if not key_norm:
        return False, None

    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            rec_key = (rec.get("key") or "").strip().upper()
            if rec_key and rec_key == key_norm:
                disabled = bool(rec.get("workspace_expiry_disabled", False))
                seconds = rec.get("workspace_expiry_seconds", None)
                return disabled, (int(seconds) if seconds else None)
    return False, None


def _matches_record(rec: dict[str, Any], *, key: str, key_hash: str) -> bool:
    rec_key = (rec.get("key") or "").strip().upper()
    if rec_key:
        return rec_key == key
    rec_hash = rec.get("key_hash")
    return bool(rec_hash and rec_hash == key_hash)


def validate_license(
    license_key: str,
    *,
    ip: str | None,
    device_id: str | None,
) -> tuple[bool, dict[str, Any]]:
    key = (license_key or "").strip().upper()
    if not key:
        return False, {"reason": "missing"}
    if not key.startswith("YMGA1-"):
        return False, {"reason": "format"}

    now = int(time.time())
    month = _month_bucket(now)
    key_hash = _key_hash(key)

    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            if not _matches_record(rec, key=key, key_hash=key_hash):
                continue
            if rec.get("revoked", False):
                return False, {"reason": "revoked"}
            expires_at = rec.get("expires_at", None)
            if expires_at is not None and int(expires_at) < now:
                return False, {"reason": "expired", "expires_at": int(expires_at)}

            license_type = rec.get("license_type", "personal")

            if license_type == "personal":
                bound_ip = rec.get("bound_ip", None)
                bound_device_id = rec.get("bound_device_id", None)
                if bound_ip and not ip:
                    return False, {"reason": "ip_required"}
                if bound_ip and ip and not _ip_binding_allows(bound_ip, ip):
                    return False, {"reason": "ip_mismatch"}
                if bound_device_id and not device_id:
                    return False, {"reason": "device_required"}
                if bound_device_id and device_id and bound_device_id != device_id:
                    return False, {"reason": "device_mismatch"}

                monthly_uses = (rec.get("monthly_uses", {}) or {})
                used_this_month = int(monthly_uses.get(month, 0) or 0)
                monthly_limit = rec.get("monthly_limit", personal_monthly_limit_default())
                if monthly_limit is not None and used_this_month >= int(monthly_limit):
                    return False, {"reason": "monthly_limit"}

            uses = int(rec.get("uses", 0) or 0)
            max_uses = rec.get("max_uses", None)
            if max_uses is not None and uses >= int(max_uses):
                return False, {"reason": "max_uses"}

            return True, {
                "license_type": license_type,
                "expires_at": int(expires_at) if expires_at is not None else None,
                "uses": uses,
                "max_uses": int(max_uses) if max_uses is not None else None,
                "unlock_all_steps": bool(rec.get("unlock_all_steps", False)),
            }

    return False, {"reason": "not_found"}


def validate_and_record_use(
    license_key: str,
    *,
    ip: str | None,
    device_id: str | None,
) -> tuple[bool, dict[str, Any]]:
    key = (license_key or "").strip().upper()
    if not key:
        return False, {"reason": "missing"}
    if not key.startswith("YMGA1-"):
        return False, {"reason": "format"}

    now = int(time.time())
    month = _month_bucket(now)
    key_hash = _key_hash(key)

    with _STORE_LOCK:
        store = _load_store()
        for rec in store.get("licenses", []):
            if not _matches_record(rec, key=key, key_hash=key_hash):
                continue
            if rec.get("revoked", False):
                return False, {"reason": "revoked"}
            expires_at = rec.get("expires_at", None)
            if expires_at is not None and int(expires_at) < now:
                return False, {"reason": "expired", "expires_at": int(expires_at)}

            license_type = rec.get("license_type", "personal")
            if license_type == "personal":
                bound_ip = rec.get("bound_ip", None)
                bound_device_id = rec.get("bound_device_id", None)
                if bound_ip and not ip:
                    return False, {"reason": "ip_required"}
                if bound_ip and ip and not _ip_binding_allows(bound_ip, ip):
                    return False, {"reason": "ip_mismatch"}
                if bound_device_id and not device_id:
                    return False, {"reason": "device_required"}
                if bound_device_id and device_id and bound_device_id != device_id:
                    return False, {"reason": "device_mismatch"}

                monthly_uses = (rec.get("monthly_uses", {}) or {})
                used_this_month = int(monthly_uses.get(month, 0) or 0)
                monthly_limit = rec.get("monthly_limit", personal_monthly_limit_default())
                if monthly_limit is not None and used_this_month >= int(monthly_limit):
                    return False, {"reason": "monthly_limit"}

            uses = int(rec.get("uses", 0) or 0)
            max_uses = rec.get("max_uses", None)
            if max_uses is not None and uses >= int(max_uses):
                return False, {"reason": "max_uses"}

            uses_after = uses + 1
            rec["uses"] = uses_after
            rec["last_used_at"] = now

            if license_type == "personal":
                monthly_uses = (rec.get("monthly_uses", {}) or {})
                used_this_month_after = int(monthly_uses.get(month, 0) or 0) + 1
                monthly_uses[month] = used_this_month_after
                rec["monthly_uses"] = monthly_uses

            _dump_store(store)

            usage_limit: int | None = None
            usage_remaining: int | None = None
            usage_period: str | None = None

            if license_type == "personal":
                # Personal licenses are monthly-limited.
                monthly_limit_val = rec.get("monthly_limit", personal_monthly_limit_default())
                monthly_limit_int = int(monthly_limit_val) if monthly_limit_val is not None else None
                if monthly_limit_int is not None:
                    usage_limit = monthly_limit_int
                    usage_remaining = max(0, monthly_limit_int - used_this_month_after)
                    usage_period = "month"
            else:
                # Commercial licenses may have an overall max_uses.
                if max_uses is not None:
                    max_uses_int = int(max_uses)
                    usage_limit = max_uses_int
                    usage_remaining = max(0, max_uses_int - uses_after)
                    usage_period = "lifetime"

            return True, {
                "license_type": license_type,
                "expires_at": int(expires_at) if expires_at is not None else None,
                "uses": uses_after,
                "max_uses": int(max_uses) if max_uses is not None else None,
                "usage_limit": usage_limit,
                "usage_remaining": usage_remaining,
                "usage_period": usage_period,
                "unlock_all_steps": bool(rec.get("unlock_all_steps", False)),
            }

    return False, {"reason": "not_found"}


def get_required_license_key_from_headers(headers: Any) -> str | None:
    return headers.get("X-License-Key") or headers.get("x-license-key")


def get_device_id_from_headers(headers: Any) -> str | None:
    return headers.get("X-Device-Id") or headers.get("x-device-id")
