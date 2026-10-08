from __future__ import annotations

import io

from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Request
from fastapi.responses import FileResponse

from app.models.schemas import TemplateParseResponse
from app.services.storage import save_upload, workspace_dir
from app.services.template_parser import extract_slots
from app.services.upload_security import validate_image_bytes
from app.routes.workspace_access import enforce_workspace_read, enforce_workspace_write

router = APIRouter()


@router.get("/clean")
async def get_clean_template(workspace_id: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    path = workspace_dir(workspace_id) / "template_clean.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path, media_type="image/png")


@router.get("/annotated")
async def get_annotated_template(workspace_id: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    path = workspace_dir(workspace_id) / "uploads" / "template_annotated.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path, media_type="image/png")


@router.post("/parse", response_model=TemplateParseResponse)
async def parse_template(
    request: Request,
    annotated_template: UploadFile | None = File(None),
    clean_template: UploadFile | None = File(None),
    workspace_id: str | None = Form(None),
    mugshot_color: str | None = Form(None),
    baby_color: str | None = Form(None),
    name_color: str | None = Form(None),
    quote_color: str | None = Form(None),
    disable_baby_photos: bool = Form(False),
    disable_quotes: bool = Form(False),
    min_area: int = Form(800),
) -> TemplateParseResponse:
    try:
        if not workspace_id:
            raise HTTPException(status_code=400, detail="workspace_id is required")
        enforce_workspace_write(request, workspace_id)

        annotated_bytes: bytes | None = None
        clean_bytes: bytes | None = None

        if annotated_template is not None:
            annotated_bytes = await annotated_template.read()
            validate_image_bytes(annotated_bytes, label="Annotated template")
        if clean_template is not None:
            clean_bytes = await clean_template.read()
            validate_image_bytes(clean_bytes, label="Clean template")

        if workspace_id and (annotated_bytes is None or clean_bytes is None):
            root = workspace_dir(workspace_id)
            if annotated_bytes is None:
                annotated_path = root / "uploads" / "template_annotated.png"
                if annotated_path.exists():
                    annotated_bytes = annotated_path.read_bytes()

            if clean_bytes is None:
                clean_path = root / "template_clean.png"
                if not clean_path.exists():
                    clean_path = root / "uploads" / "template_clean.png"
                if clean_path.exists():
                    clean_bytes = clean_path.read_bytes()

        if annotated_bytes is None or clean_bytes is None:
            raise HTTPException(
                status_code=400,
                detail="Missing template uploads. Upload both annotated and clean templates, or provide workspace_id with previously uploaded templates.",
            )

        response = extract_slots(
            io.BytesIO(annotated_bytes),
            clean_template=io.BytesIO(clean_bytes),
            mugshot_hex=mugshot_color,
            baby_hex=baby_color,
            name_hex=name_color,
            quote_hex=quote_color,
            enable_baby_photos=not disable_baby_photos,
            enable_quotes=not disable_quotes,
            min_area=min_area,
            tolerance=tolerance,
            template_id=workspace_id,
        )
        # Persist templates for later steps and re-processing.
        save_upload(response.template_id, "template_clean.png", io.BytesIO(clean_bytes))
        save_upload(response.template_id, "uploads/template_clean.png", io.BytesIO(clean_bytes))
        save_upload(response.template_id, "uploads/template_annotated.png", io.BytesIO(annotated_bytes))
        return response
    except HTTPException:
        raise
    except Exception as exc:  # surface parsing failures with detail
        raise HTTPException(status_code=400, detail=f"Template parsing failed: {exc}")
