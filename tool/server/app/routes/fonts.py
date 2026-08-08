from __future__ import annotations

from pathlib import Path
import io

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fontTools.ttLib import TTFont

from app.services.fonts import list_system_fonts, list_workspace_fonts, font_mime
from app.services.admin_settings import get_face_detection_settings
from app.services.storage import safe_filename, save_upload, workspace_file
from app.routes.workspace_access import enforce_workspace_read, enforce_workspace_write

router = APIRouter()


@router.get("/list")
async def list_fonts(request: Request, workspace_id: str | None = None) -> dict[str, list[dict]]:
    if workspace_id:
        enforce_workspace_read(request, workspace_id)
    system_fonts = list_system_fonts()
    uploaded = list_workspace_fonts(workspace_id) if workspace_id else []
    return {"system": system_fonts, "uploaded": uploaded}


@router.post("/upload")
async def upload_font(request: Request, workspace_id: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
    enforce_workspace_write(request, workspace_id)
    if not get_face_detection_settings().enable_custom_font_upload:
        raise HTTPException(status_code=403, detail="Custom font uploads are disabled")

    filename = safe_filename(Path(file.filename or "").name)
    if Path(filename).suffix.lower() not in {".ttf", ".otf"}:
        raise HTTPException(status_code=400, detail="Only TTF and OTF font files are supported")
    data = await file.read()
    if not data or len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Font file is empty or exceeds the 20 MiB limit")
    try:
        font = TTFont(io.BytesIO(data), lazy=False)
        font.close()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid font file") from None
    save_upload(workspace_id, f"fonts/{filename}", io.BytesIO(data))
    return {"filename": filename}


@router.get("/get")
async def get_font(workspace_id: str, filename: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    path = workspace_file(workspace_id, "fonts", safe_filename(filename))
    if not path.exists():
        return {"error": "not found"}
    return FileResponse(path, media_type=font_mime(path))
