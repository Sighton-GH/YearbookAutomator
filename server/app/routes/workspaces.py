from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.storage import (
    delete_workspace,
    merge_workspace_meta,
    read_workspace_meta,
    request_end_session,
    touch_workspace,
)
from app.services.workspace_registry import (
    admin_takeover_workspace,
    ensure_workspace_write_access,
    heartbeat_workspace,
    release_workspace,
    resolve_workspace,
    unregister_workspace,
)
from app.routes.licensing import admin_basic_auth_valid, get_admin_session_state

router = APIRouter()


class ResolveWorkspaceRequest(BaseModel):
    session_id: str | None = None


class ResolveWorkspaceResponse(BaseModel):
    ok: bool
    workspace_id: str | None = None
    license_type: str
    created_new: bool = False
    recreated_after_expiry: bool = False
    state: str = "ready"
    lock_expires_at: int | None = None
    lock_holder_device_id: str | None = None


class WorkspaceActionRequest(BaseModel):
    workspace_id: str
    session_id: str | None = None


class WorkspaceStateRequest(BaseModel):
    workspace_id: str
    default_baby_filename: str | None = None
    default_mugshot_filenames: list[str] | None = None
    session_snapshot: dict[str, Any] | None = None
    session_updated_at_ms: int | None = None


class WorkspaceStateResponse(BaseModel):
    workspace_id: str
    default_baby_filename: str | None = None
    default_mugshot_filenames: list[str] = Field(default_factory=list)
    session_snapshot: dict[str, Any] | None = None
    session_updated_at_ms: int | None = None


def _read_workspace_state(workspace_id: str) -> WorkspaceStateResponse:
    meta = read_workspace_meta(workspace_id)
    state = meta.get("tool_state") if isinstance(meta.get("tool_state"), dict) else {}
    raw_mugshots = state.get("default_mugshot_filenames") if isinstance(state, dict) else []
    mugshots = [str(v).strip() for v in (raw_mugshots or []) if str(v or "").strip()]
    return WorkspaceStateResponse(
        workspace_id=workspace_id,
        default_baby_filename=(str(state.get("default_baby_filename") or "").strip() or None) if isinstance(state, dict) else None,
        default_mugshot_filenames=mugshots,
        session_snapshot=(state.get("session_snapshot") if isinstance(state.get("session_snapshot"), dict) else None) if isinstance(state, dict) else None,
        session_updated_at_ms=(int(state.get("session_updated_at_ms")) if isinstance(state.get("session_updated_at_ms"), (int, float)) else None) if isinstance(state, dict) else None,
    )


def _enforce_workspace_write_access(request: Request, workspace_id: str) -> None:
    meta = getattr(request.state, "license_meta", None) or {}
    license_type = "commercial" if str(meta.get("license_type") or "") == "commercial" else "personal"
    ok, reason = ensure_workspace_write_access(
        workspace_id=workspace_id,
        license_key=str(getattr(request.state, "license_key", "") or ""),
        license_type=license_type,
        device_id=getattr(request.state, "license_device_id", None),
        session_id=getattr(request.state, "client_session_id", None),
    )
    if not ok:
        status = 409 if reason in {"workspace_locked", "workspace_lock_expired", "workspace_not_checked_out"} else 403
        raise HTTPException(status_code=status, detail=reason or "workspace_write_not_allowed")


@router.post("/touch")
async def touch(
    request: Request,
    workspace_id: str = Form(...),
    session_id: str | None = Form(None),
    started_at_ms: int | None = Form(None),
    expires_at_ms: int | None = Form(None),
) -> dict[str, bool]:
    """Mark a workspace as active.

    Frontend calls this periodically while the user has an open tab.
    """
    meta = getattr(request.state, "license_meta", None) or {}
    device_id = getattr(request.state, "license_device_id", None)
    effective_session_id = session_id or getattr(request.state, "client_session_id", None)
    license_type = str(meta.get("license_type") or "personal")
    hb_ok, hb_reason = heartbeat_workspace(
        workspace_id=workspace_id,
        license_type="commercial" if license_type == "commercial" else "personal",
        device_id=device_id,
        session_id=effective_session_id,
        started_at_ms=started_at_ms,
        expires_at_ms=expires_at_ms,
    )
    if not hb_ok:
        if hb_reason == "workspace_not_registered":
            touch_workspace(workspace_id, session_id=effective_session_id, started_at_ms=started_at_ms, expires_at_ms=expires_at_ms)
            return {"ok": True}
        if hb_reason == "workspace_locked":
            raise HTTPException(status_code=409, detail="workspace_locked")
        raise HTTPException(status_code=400, detail=hb_reason or "workspace_heartbeat_failed")

    # Keep existing behavior as a fallback if workspace is not in registry yet.
    touch_workspace(workspace_id, session_id=effective_session_id, started_at_ms=started_at_ms, expires_at_ms=expires_at_ms)
    return {"ok": True}


@router.post("/resolve", response_model=ResolveWorkspaceResponse)
async def resolve(req: ResolveWorkspaceRequest, request: Request) -> ResolveWorkspaceResponse:
    key = getattr(request.state, "license_key", None)
    device_id = getattr(request.state, "license_device_id", None)
    if not key:
        raise HTTPException(status_code=401, detail="License key required")

    meta = getattr(request.state, "license_meta", None) or {}
    license_type = str(meta.get("license_type") or "personal")
    resolved = resolve_workspace(
        license_key=key,
        license_type="commercial" if license_type == "commercial" else "personal",
        device_id=device_id,
        session_id=req.session_id or getattr(request.state, "client_session_id", None),
    )
    if not resolved.ok and resolved.lock_conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "workspace_locked",
                "message": "Workspace tied to this commercial license is currently in use.",
                "lock_expires_at": resolved.lock_expires_at,
                "lock_holder_device_id": resolved.lock_holder_device_id,
            },
        )

    return ResolveWorkspaceResponse(
        ok=True,
        workspace_id=resolved.workspace_id,
        license_type=license_type,
        created_new=resolved.created_new,
        recreated_after_expiry=resolved.recreated_after_expiry,
        state="expired_recreated" if resolved.recreated_after_expiry else "ready",
    )


@router.post("/release")
async def release(req: WorkspaceActionRequest, request: Request) -> dict[str, bool]:
    meta = getattr(request.state, "license_meta", None) or {}
    device_id = getattr(request.state, "license_device_id", None)
    license_type = "commercial" if str(meta.get("license_type") or "") == "commercial" else "personal"
    rel_ok, rel_reason = release_workspace(
        workspace_id=req.workspace_id,
        license_type=license_type,
        device_id=device_id,
        session_id=req.session_id or getattr(request.state, "client_session_id", None),
    )
    if not rel_ok:
        if rel_reason == "workspace_locked":
            raise HTTPException(status_code=409, detail="workspace_locked")
        raise HTTPException(status_code=400, detail=rel_reason or "workspace_release_failed")
    return {"ok": True}


@router.get("/state", response_model=WorkspaceStateResponse)
async def get_state(workspace_id: str) -> WorkspaceStateResponse:
    return _read_workspace_state(workspace_id)


@router.post("/state", response_model=WorkspaceStateResponse)
async def set_state(req: WorkspaceStateRequest, request: Request) -> WorkspaceStateResponse:
    _enforce_workspace_write_access(request, req.workspace_id)

    mugshots = [str(v).strip() for v in (req.default_mugshot_filenames or []) if str(v or "").strip()]
    next_state = {
        "default_baby_filename": (str(req.default_baby_filename or "").strip() or None),
        "default_mugshot_filenames": mugshots,
    }

    if isinstance(req.session_snapshot, dict):
        next_state["session_snapshot"] = req.session_snapshot
    if isinstance(req.session_updated_at_ms, int):
        next_state["session_updated_at_ms"] = req.session_updated_at_ms

    meta = read_workspace_meta(req.workspace_id)
    merge_workspace_meta(req.workspace_id, {"tool_state": {**(meta.get("tool_state") if isinstance(meta.get("tool_state"), dict) else {}), **next_state}})
    return _read_workspace_state(req.workspace_id)


@router.post("/takeover")
async def takeover(req: WorkspaceActionRequest, request: Request) -> dict[str, bool]:
    # Admin-only force takeover for commercial workspace locks.
    is_valid, _, _ = get_admin_session_state(request)
    if not is_valid and not admin_basic_auth_valid(request):
        raise HTTPException(status_code=401, detail="Admin authentication required")

    device_id = getattr(request.state, "license_device_id", None)
    ok, reason = admin_takeover_workspace(
        workspace_id=req.workspace_id,
        device_id=device_id,
        session_id=req.session_id or getattr(request.state, "client_session_id", None),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=reason or "workspace_takeover_failed")
    return {"ok": True}


@router.post("/end-session")
async def end_session(workspace_id: str = Form(...)) -> dict[str, bool]:
    """Request cleanup for a workspace.

    This does not necessarily delete immediately; a background janitor will
    delete after a short grace period unless the workspace is "touched" again.
    """
    request_end_session(workspace_id)
    return {"ok": True}


@router.delete("/{workspace_id}")
async def delete(workspace_id: str) -> dict[str, bool]:
    """Immediately delete a workspace directory (best-effort)."""
    deleted = delete_workspace(workspace_id)
    unregister_workspace(workspace_id)
    if not deleted:
        # Not an error: id may be unknown or already deleted.
        return {"deleted": False}
    return {"deleted": True}
