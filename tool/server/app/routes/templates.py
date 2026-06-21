from __future__ import annotations

import io

from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Request
from fastapi.responses import FileResponse

from app.models.schemas import TemplateParseResponse
from app.services.storage import save_upload, workspace_dir
from app.services.template_parser import extract_slots
from app.services.workspace_registry import ensure_workspace_write_access

router = APIRouter()


@router.get("/clean")
async def get_clean_template(workspace_id: str):
    path = workspace_dir(workspace_id) / "template_clean.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path, media_type="image/png")


@router.get("/annotated")
async def get_annotated_template(workspace_id: str):
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
    min_area: int = Form(400),
) -> TemplateParseResponse:
    try:
        if workspace_id:
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

        annotated_bytes: bytes | None = None
        clean_bytes: bytes | None = None

        if annotated_template is not None:
            annotated_bytes = await annotated_template.read()
        if clean_template is not None:
            clean_bytes = await clean_template.read()

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
            template_id=workspace_id,
        )
        # Persist templates for later steps and re-processing.
        save_upload(response.template_id, "template_clean.png", io.BytesIO(clean_bytes))
        save_upload(response.template_id, "uploads/template_clean.png", io.BytesIO(clean_bytes))
        save_upload(response.template_id, "uploads/template_annotated.png", io.BytesIO(annotated_bytes))
        return response
    except Exception as exc:  # surface parsing failures with detail
        raise HTTPException(status_code=400, detail=f"Template parsing failed: {exc}")
