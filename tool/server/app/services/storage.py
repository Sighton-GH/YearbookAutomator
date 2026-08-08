from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path
from threading import RLock
from typing import BinaryIO
from uuid import uuid4

_DEFAULT_BASE_DATA = Path(__file__).resolve().parent.parent / "data"
BASE_DATA = Path(os.getenv("YMGA_WORKSPACE_DATA_DIR", str(_DEFAULT_BASE_DATA))).expanduser().resolve()
BASE_DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
try:
    BASE_DATA.chmod(0o700)
except OSError:
    pass

# Accept hex IDs (default) and human-friendly IDs (tests/dev), alnum plus _ or -.
_WORKSPACE_ID_RE = re.compile(r"^[0-9A-Za-z_-]{3,64}$")
DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60
_STORAGE_QUOTA_LOCK = RLock()


def _tool_session_ttl_seconds() -> int:
    """Default (personal-license) workspace-session TTL.

    Only used when a caller doesn't pass an explicit `ttl_seconds` to
    `touch_workspace` (e.g. legacy/edge call sites). Commercial-license TTLs
    are resolved per-license in `workspace_registry.py` and always passed in
    explicitly.
    """
    try:
        from app.services.admin_settings import get_face_detection_settings

        settings = get_face_detection_settings()
        ttl = int(getattr(settings, "personal_workspace_timeout_seconds", DEFAULT_SESSION_TTL_SECONDS))
        return max(60, ttl)
    except Exception:
        return DEFAULT_SESSION_TTL_SECONDS


class InvalidWorkspaceId(ValueError):
    pass


class InvalidWorkspacePath(ValueError):
    pass


class UploadTooLarge(ValueError):
    pass


def _env_positive_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default)) or str(default)))
    except ValueError:
        return default


def workspace_usage_bytes(workspace_id: str) -> int:
    root = workspace_path(workspace_id)
    if not root.exists():
        return 0
    total = 0
    for path in root.rglob("*"):
        if path.is_file():
            try:
                total += path.stat().st_size
            except OSError:
                continue
    return total


def ensure_workspace_capacity(workspace_id: str, incoming_bytes: int, *, replacing: Path | None = None) -> None:
    max_bytes = _env_positive_int("YMGA_MAX_WORKSPACE_BYTES", 10 * 1024 * 1024 * 1024)
    current = workspace_usage_bytes(workspace_id)
    if replacing is not None and replacing.exists():
        try:
            current -= replacing.stat().st_size
        except OSError:
            pass
    if current + max(0, int(incoming_bytes)) > max_bytes:
        raise UploadTooLarge(f"Workspace exceeds the {max_bytes // (1024 * 1024)} MiB storage quota")


def validate_workspace_id(workspace_id: str) -> None:
    if not _WORKSPACE_ID_RE.fullmatch(workspace_id or ""):
        raise InvalidWorkspaceId("Invalid workspace_id")


def new_workspace_id() -> str:
    return uuid4().hex


def workspace_dir(workspace_id: str) -> Path:
    validate_workspace_id(workspace_id)
    root = BASE_DATA / workspace_id
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass
    return root


def workspace_path(workspace_id: str) -> Path:
    """Return workspace path without creating it."""
    validate_workspace_id(workspace_id)
    return BASE_DATA / workspace_id


def workspace_file(workspace_id: str, *relative_parts: str) -> Path:
    """Return a path contained by one workspace, rejecting traversal and symlinks."""
    root = workspace_dir(workspace_id).resolve()
    if not relative_parts:
        raise InvalidWorkspacePath("A workspace-relative file path is required")
    try:
        candidate = root.joinpath(*relative_parts).resolve(strict=False)
        candidate.relative_to(root)
    except (OSError, RuntimeError, ValueError):
        raise InvalidWorkspacePath("Invalid workspace file path") from None
    if candidate == root:
        raise InvalidWorkspacePath("A workspace-relative file path is required")
    return candidate


def safe_filename(filename: str, *, max_length: int = 180) -> str:
    """Validate a single user-controlled filename without changing its meaning."""
    name = str(filename or "").strip()
    if (
        not name
        or len(name) > max_length
        or name in {".", ".."}
        or "\x00" in name
        or Path(name).name != name
        or "/" in name
        or "\\" in name
    ):
        raise InvalidWorkspacePath("Invalid filename")
    return name


def restrict_file_permissions(path: Path) -> None:
    """Best-effort owner-only permissions on filesystems that support POSIX modes."""
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _meta_path(workspace_id: str) -> Path:
    return workspace_path(workspace_id) / "meta.json"


def read_workspace_meta(workspace_id: str) -> dict:
    path = _meta_path(workspace_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def _write_workspace_meta(workspace_id: str, meta: dict) -> None:
    root = workspace_dir(workspace_id)
    path = root / "meta.json"
    tmp = root / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    restrict_file_permissions(tmp)
    tmp.replace(path)


def write_workspace_meta(workspace_id: str, meta: dict) -> None:
    """Persist complete workspace metadata payload."""
    _write_workspace_meta(workspace_id, meta)


def merge_workspace_meta(workspace_id: str, updates: dict) -> dict:
    """Merge keys into workspace metadata and persist.

    Keys with value None are removed from metadata.
    Returns the updated metadata payload.
    """
    meta = read_workspace_meta(workspace_id)
    for key, value in (updates or {}).items():
        if value is None:
            meta.pop(key, None)
        else:
            meta[key] = value
    _write_workspace_meta(workspace_id, meta)
    return meta


def touch_workspace(
    workspace_id: str,
    *,
    session_id: str | None = None,
    started_at_ms: int | float | None = None,
    expires_at_ms: int | float | None = None,
    ttl_seconds: int | None = None,
    expiry_disabled: bool = False,
) -> None:
    """Mark workspace as active and clear any pending end-session request.

    Session expiry is capped by `ttl_seconds` (falls back to the personal-license
    default if not given). If `expiry_disabled` is True, no expiry is computed at
    all and the workspace is never swept by the cleanup janitor.
    """
    meta = read_workspace_meta(workspace_id)
    now_s = time.time()
    meta["last_seen"] = now_s

    # Keep a stable session start once established for this workspace.
    session_started_at = meta.get("session_started_at")
    try:
        session_started_at_s = float(session_started_at) if session_started_at is not None else 0.0
    except (TypeError, ValueError):
        session_started_at_s = 0.0

    if session_started_at_s <= 0:
        if started_at_ms is not None:
            try:
                session_started_at_s = float(started_at_ms) / 1000.0
            except (TypeError, ValueError):
                session_started_at_s = now_s
        else:
            session_started_at_s = now_s
        meta["session_started_at"] = session_started_at_s

    if expiry_disabled:
        meta["workspace_expiry_disabled"] = True
        meta.pop("session_expires_at", None)
    else:
        meta.pop("workspace_expiry_disabled", None)

        # Expires at most ttl_seconds from session start (policy). Never extend beyond that.
        effective_ttl = int(ttl_seconds) if ttl_seconds is not None else _tool_session_ttl_seconds()
        hard_expiry_s = session_started_at_s + effective_ttl
        candidate_expiry_s = hard_expiry_s
        if expires_at_ms is not None:
            try:
                candidate_expiry_s = float(expires_at_ms) / 1000.0
            except (TypeError, ValueError):
                candidate_expiry_s = hard_expiry_s

        candidate_expiry_s = min(candidate_expiry_s, hard_expiry_s)
        prev_expiry = meta.get("session_expires_at")
        try:
            prev_expiry_s = float(prev_expiry) if prev_expiry is not None else 0.0
        except (TypeError, ValueError):
            prev_expiry_s = 0.0

        # Keep earliest known expiry to avoid accidental extension.
        if prev_expiry_s > 0:
            meta["session_expires_at"] = min(prev_expiry_s, candidate_expiry_s)
        else:
            meta["session_expires_at"] = candidate_expiry_s

    if session_id:
        meta["session_id"] = str(session_id)

    meta.pop("end_requested_at", None)
    _write_workspace_meta(workspace_id, meta)


def request_end_session(workspace_id: str) -> None:
    """Request that a workspace be deleted soon (after a grace period)."""
    root = workspace_path(workspace_id)
    if not root.exists():
        return
    meta = read_workspace_meta(workspace_id)
    meta["end_requested_at"] = time.time()
    # Keep last_seen if present; don't create one on end-session.
    _write_workspace_meta(workspace_id, meta)


def delete_workspace(workspace_id: str) -> bool:
    """Delete the on-disk workspace folder, returning True if removed."""
    root = workspace_path(workspace_id)
    if not root.exists():
        return False
    # Extra safety: ensure we're deleting a direct child of BASE_DATA.
    if root.parent.resolve() != BASE_DATA.resolve():
        return False
    shutil.rmtree(root, ignore_errors=True)
    return not root.exists()


def list_workspace_ids() -> list[str]:
    ids: list[str] = []
    for child in BASE_DATA.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        # Reserve underscore-prefixed folders for internal app data.
        # Example: `_licenses` stores licensing secrets/records and should not be wiped.
        if name.startswith("_"):
            continue
        if _WORKSPACE_ID_RE.fullmatch(name):
            ids.append(name)
    return ids


def clear_all_workspaces() -> int:
    """Delete all on-disk workspaces under BASE_DATA.

    Intended for local/dev usage.
    """
    deleted = 0
    for wid in list_workspace_ids():
        if delete_workspace(wid):
            deleted += 1
    return deleted


def save_upload(workspace_id: str, filename: str, fileobj: BinaryIO) -> Path:
    target = workspace_file(workspace_id, filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    max_bytes = _env_positive_int("YMGA_MAX_STORED_FILE_BYTES", 512 * 1024 * 1024)
    written = 0
    with _STORAGE_QUOTA_LOCK:
        existing_bytes = target.stat().st_size if target.exists() else 0
        workspace_bytes = max(0, workspace_usage_bytes(workspace_id) - existing_bytes)
        workspace_limit = _env_positive_int("YMGA_MAX_WORKSPACE_BYTES", 10 * 1024 * 1024 * 1024)
        temp_target = target.with_name(f".{target.name}.{uuid4().hex}.upload")
        try:
            with open(temp_target, "xb") as f:
                while True:
                    chunk = fileobj.read(min(1024 * 1024, max_bytes - written + 1))
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        raise UploadTooLarge(f"File exceeds the {max_bytes // (1024 * 1024)} MiB storage limit")
                    if workspace_bytes + written > workspace_limit:
                        raise UploadTooLarge(f"Workspace exceeds the {workspace_limit // (1024 * 1024)} MiB storage quota")
                    f.write(chunk)
            restrict_file_permissions(temp_target)
            temp_target.replace(target)
        except Exception:
            temp_target.unlink(missing_ok=True)
            raise
    return target


def list_files(workspace_id: str, subdir: str) -> list[Path]:
    root = workspace_dir(workspace_id) / subdir
    if not root.exists():
        return []
    return [p for p in root.iterdir() if p.is_file()]
