from __future__ import annotations

from fastapi import APIRouter, Form

from app.services.storage import delete_workspace, request_end_session, touch_workspace

router = APIRouter()


@router.post("/touch")
async def touch(
    workspace_id: str = Form(...),
    session_id: str | None = Form(None),
    started_at_ms: int | None = Form(None),
    expires_at_ms: int | None = Form(None),
) -> dict[str, bool]:
    """Mark a workspace as active.

    Frontend calls this periodically while the user has an open tab.
    """
    touch_workspace(
        workspace_id,
        session_id=session_id,
        started_at_ms=started_at_ms,
        expires_at_ms=expires_at_ms,
    )
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
    if not deleted:
        # Not an error: id may be unknown or already deleted.
        return {"deleted": False}
    return {"deleted": True}
