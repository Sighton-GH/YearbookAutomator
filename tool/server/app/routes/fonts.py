from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.services.fonts import list_system_fonts, list_workspace_fonts, font_mime
from app.services.storage import save_upload, workspace_dir
from app.services.workspace_registry import ensure_workspace_write_access

router = APIRouter()


@router.get("/list")
async def list_fonts(workspace_id: str | None = None) -> dict[str, list[dict]]:
    system_fonts = list_system_fonts()
    uploaded = list_workspace_fonts(workspace_id) if workspace_id else []
    return {"system": system_fonts, "uploaded": uploaded}


@router.post("/upload")
async def upload_font(request: Request, workspace_id: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
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

    filename = Path(file.filename).name
    save_upload(workspace_id, f"fonts/{filename}", file.file)
    return {"filename": filename}


@router.get("/get")
async def get_font(workspace_id: str, filename: str):
    path = workspace_dir(workspace_id) / "fonts" / filename
    if not path.exists():
        return {"error": "not found"}
    return FileResponse(path, media_type=font_mime(path))
