from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.services.fonts import list_system_fonts, list_workspace_fonts, font_mime
from app.services.storage import save_upload, workspace_dir

router = APIRouter()


@router.get("/list")
async def list_fonts(workspace_id: str | None = None) -> dict[str, list[dict]]:
    system_fonts = list_system_fonts()
    uploaded = list_workspace_fonts(workspace_id) if workspace_id else []
    return {"system": system_fonts, "uploaded": uploaded}


@router.post("/upload")
async def upload_font(workspace_id: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
    filename = Path(file.filename).name
    save_upload(workspace_id, f"fonts/{filename}", file.file)
    return {"filename": filename}


@router.get("/get")
async def get_font(workspace_id: str, filename: str):
    path = workspace_dir(workspace_id) / "fonts" / filename
    if not path.exists():
        return {"error": "not found"}
    return FileResponse(path, media_type=font_mime(path))
