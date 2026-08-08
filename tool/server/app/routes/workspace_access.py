from __future__ import annotations

from fastapi import HTTPException, Request

from app.services.workspace_registry import ensure_workspace_read_access, ensure_workspace_write_access


def _context(request: Request) -> tuple[str, str, str | None, str | None]:
    meta = getattr(request.state, "license_meta", None) or {}
    license_type = "commercial" if str(meta.get("license_type") or "") == "commercial" else "personal"
    return (
        str(getattr(request.state, "license_key", "") or ""),
        license_type,
        getattr(request.state, "license_device_id", None),
        getattr(request.state, "client_session_id", None),
    )


def enforce_workspace_read(request: Request, workspace_id: str) -> None:
    key, license_type, device_id, _ = _context(request)
    ok, reason = ensure_workspace_read_access(
        workspace_id=workspace_id,
        license_key=key,
        license_type=license_type,  # type: ignore[arg-type]
        device_id=device_id,
    )
    if not ok:
        raise HTTPException(status_code=403, detail=reason or "workspace_read_not_allowed")


def enforce_workspace_write(request: Request, workspace_id: str) -> None:
    key, license_type, device_id, session_id = _context(request)
    ok, reason = ensure_workspace_write_access(
        workspace_id=workspace_id,
        license_key=key,
        license_type=license_type,  # type: ignore[arg-type]
        device_id=device_id,
        session_id=session_id,
    )
    if not ok:
        status = 409 if reason in {"workspace_locked", "workspace_lock_expired", "workspace_not_checked_out"} else 403
        raise HTTPException(status_code=status, detail=reason or "workspace_write_not_allowed")
