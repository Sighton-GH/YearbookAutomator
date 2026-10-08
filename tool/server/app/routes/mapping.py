from __future__ import annotations

from pathlib import Path
from typing import Literal
import io
import logging
import zipfile
import re
from difflib import SequenceMatcher

from pydantic import TypeAdapter
import pandas as pd

import mimetypes

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request

from app.models.schemas import MappingRequest, MappingDecision, PersonRecord, SpreadsheetPreview
from app.services.image_messages import BACKGROUND_FAILURE, unsupported_image_message
from app.services.mapping_review import apply_mapping_decisions
from app.services.spreadsheet import RosterFormatError, ingest_spreadsheet
from app.services.name_matching import (
    compact_name,
    is_archive_junk,
    match_people,
    name_tokens,
    normalize_name,
    unique_stored_name,
)
from app.services.storage import safe_filename, save_upload, workspace_dir, workspace_file
from app.services.upload_security import (
    UnsafeUpload,
    read_zip_member,
    validate_image_bytes,
    validate_spreadsheet_bytes,
    validate_zip_archive,
)
from app.services.background_removal import (
    prepare_background_model,
    BackgroundMode,
    background_removed_filename,
    remove_background as remove_background_bytes,
    BackgroundAlreadyRemovedError,
)
from app.services.background_jobs import (
    BackgroundJobCancelled,
    request_cancel as request_bg_cancel,
    raise_if_cancelled as raise_if_bg_cancelled,
    release_job as release_bg_job,
    start_job as start_bg_job,
    try_reserve_job as try_reserve_bg_job,
    update_job as update_bg_job,
    get_job as get_bg_job,
    to_status_payload,
)
from app.services.admin_settings import get_face_detection_settings
from app.services.generator import detect_face_center
from app.routes.workspace_access import enforce_workspace_read, enforce_workspace_write
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from uuid import uuid4
from threading import Thread
import time

router = APIRouter()


def _pdf_first_page_to_png_bytes(pdf_bytes: bytes, *, dpi: int = 200) -> tuple[bytes, int]:
    """Render the first page of a PDF to PNG bytes.

    Returns: (png_bytes, page_count)
    """

    if not pdf_bytes:
        raise ValueError("Empty PDF")
    if len(pdf_bytes) > 25 * 1024 * 1024:
        raise ValueError("PDF exceeds the 25 MiB conversion limit")
    try:
        import fitz  # PyMuPDF
    except Exception as exc:
        raise RuntimeError("PyMuPDF not installed") from exc

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_count = int(getattr(doc, "page_count", 0) or 0)
        if page_count <= 0:
            raise ValueError("PDF has no pages")
        if page_count > 500:
            raise ValueError("PDF contains too many pages")
        page = doc.load_page(0)
        scale = float(dpi) / 72.0
        rect = page.rect
        if int(rect.width * scale) * int(rect.height * scale) > 40_000_000:
            raise ValueError("PDF page is too large to render safely")
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return pix.tobytes("png"), page_count
    finally:
        doc.close()


@router.get("/baby-mask")
async def get_baby_mask(
    workspace_id: str,
    request: Request,
    x: int,
    y: int,
    width: int,
    height: int,
):
    """Return the exact baby-slot alpha mask saved during template parsing.

    The mask file is keyed by the baby slot's box coordinates, matching the
    lookup used during generation.
    """
    if width <= 0 or height <= 0:
        raise HTTPException(status_code=400, detail="Invalid mask dimensions")
    enforce_workspace_read(request, workspace_id)

    path = workspace_dir(workspace_id) / "masks" / "baby" / f"{int(x)}_{int(y)}_{int(width)}_{int(height)}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Mask not found")
    return FileResponse(path, media_type="image/png")


@router.post("/detect-face-center")
async def detect_face_center_api(image: UploadFile = File(...)):
    """Detect the face center in an arbitrary uploaded image.

    This is used by the baby-photo editor to auto-center the crop on a face.
    """

    if not get_face_detection_settings().enable_center_on_face_ops:
        raise HTTPException(status_code=403, detail="Face detection is disabled by admin settings")

    try:
        raw = await image.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image")
        validate_image_bytes(raw, label="Face-detection image")
        from PIL import Image, ImageOps

        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image")

    from app.services.face_detection import detect_face_box_for_editor_with_meta

    try:
        result = detect_face_box_for_editor_with_meta(img)
    except Exception:
        logging.getLogger(__name__).exception("Face detection failed")
        raise HTTPException(status_code=503, detail="Could not detect a face. Try again later or centre the photo manually.") from None
    if not result:
        # Face detection is optional (depends on numpy/opencv). Make this
        # user-actionable for the UI.
        try:
            import cv2  # type: ignore

            _ = cv2  # avoid lint unused
            unavailable = False
        except Exception:
            unavailable = True
        return JSONResponse(
            {
                "found": False,
                "reason": "unavailable" if unavailable else "not_found",
                "center_x": None,
                "center_y": None,
                "face_width": None,
                "face_height": None,
                "detector": None,
                "detector_rotation_cw": None,
                "width": img.width,
                "height": img.height,
            }
        )

    face, detector, rotation_cw = result
    cx = face.x + face.w / 2.0
    cy = face.y + face.h / 2.0
    return JSONResponse(
        {
            "found": True,
            "center_x": float(cx),
            "center_y": float(cy),
            "face_width": float(face.w),
            "face_height": float(face.h),
            "detector": detector,
            "detector_rotation_cw": int(rotation_cw),
            "width": img.width,
            "height": img.height,
        }
    )


_FILENAME_STOPWORDS = {
    "blob",
    "img",
    "image",
    "photo",
    "picture",
    "pic",
    "scan",
    "upload",
    "download",
    "file",
    "baby",
    "mugshot",
}


def _compact_filename_name(stem_raw: str) -> str:
    """Extract a compacted name-like string from a filename stem.

    This intentionally drops common junk tokens (timestamps, 'blob', etc.) so
    partial matching compares the actual name portion.
    """

    norm = normalize_name(stem_raw)
    if not norm:
        return ""
    tokens = norm.split()

    def split_alnum(token: str) -> list[str]:
        # Break things like '1739241452474blob' into ['1739241452474','blob']
        return re.findall(r"[a-z]+|\d+", token)

    kept: list[str] = []
    for t in tokens:
        if not t:
            continue
        for part in split_alnum(t):
            if not part:
                continue
            if part.isdigit():
                # timestamps / IDs
                continue
            if part in _FILENAME_STOPWORDS:
                continue
            if not any(ch.isalpha() for ch in part):
                continue
            kept.append(part)

    if not kept:
        return ""

    return "".join(kept)


def _char_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    # SequenceMatcher is stdlib and works well for "most characters match" heuristics.
    return float(SequenceMatcher(None, a, b).ratio())


def _best_partial_name_match(stem_compact: str, people: list[PersonRecord]) -> tuple[int | None, float, float]:
    """Return (best_person_index, best_score, second_best_score).

    Uses a conservative character-similarity ratio on compacted names.
    """

    if not stem_compact:
        return (None, 0.0, 0.0)

    scored: list[tuple[int, float]] = []
    for p in people:
        full_a = compact_name(f"{p.first_name} {p.last_name}")
        full_b = compact_name(f"{p.last_name} {p.first_name}")
        score = max(_char_similarity(stem_compact, full_a), _char_similarity(stem_compact, full_b))
        scored.append((p.index, score))

    scored.sort(key=lambda t: t[1], reverse=True)
    if not scored:
        return (None, 0.0, 0.0)

    best_idx, best = scored[0]
    second = scored[1][1] if len(scored) > 1 else 0.0
    return (best_idx, best, second)


def _looks_like_email(text: str) -> bool:
    return bool(re.search(r"\b\S+@\S+\.\S+\b", text))


def _looks_like_url(text: str) -> bool:
    return bool(re.search(r"\bhttps?://\S+\b", text, flags=re.IGNORECASE))


def _is_placeholder_quote(text: str) -> bool:
    s = (text or "").strip().strip(".!?-\u2014\u2013:;'\"").strip().casefold()
    if not s:
        return True
    return s in {
        "rejected",
        "reject",
        "denied",
        "not approved",
        "n/a",
        "na",
        "none",
        "nil",
        "null",
        "tbd",
        "tba",
        "pending",
        "no quote",
        "noquote",
        "x",
        "-",
        "\u2014",
    }


def _looks_like_quote(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return False
    if _looks_like_email(s) or _looks_like_url(s):
        return False
    # Reject strings that are basically numeric/IDs.
    alnum = re.sub(r"[^A-Za-z0-9]+", "", s)
    if not alnum:
        return False
    letters = sum(ch.isalpha() for ch in alnum)
    digits = sum(ch.isdigit() for ch in alnum)
    if letters < 3:
        return False
    if digits > letters * 2:
        return False
    # Should look like a phrase (at least two words)
    words = re.findall(r"[A-Za-z]{2,}", s)
    if len(words) < 2:
        return False
    return True


@router.post("/ingest", response_model=SpreadsheetPreview)
async def ingest(
    request: Request,
    spreadsheet: UploadFile | None = File(None),
    workspace_id: str = Form(...),
    mugshots_zip: UploadFile | None = File(None),
    naming_pattern: str = Form(r"\d{1,4}"),
    advanced_name_match: bool = Form(False),
    filename_column: str | None = Form(None),
) -> SpreadsheetPreview:
    enforce_workspace_write(request, workspace_id)
    if filename_column is not None and len(filename_column) > 200:
        raise HTTPException(status_code=400, detail="Filename column name is too long")
    if len(naming_pattern) > 80:
        raise HTTPException(status_code=400, detail="Naming pattern is too long")
    if not get_face_detection_settings().enable_advanced_name_matching:
        advanced_name_match = False

    # If caller didn't re-upload inputs (e.g., after refresh), fall back to saved uploads.
    spreadsheet_file = spreadsheet.file if spreadsheet else None
    spreadsheet_name = spreadsheet.filename if spreadsheet else None
    mugshots_file = mugshots_zip.file if mugshots_zip else None

    root = workspace_dir(workspace_id)
    if spreadsheet_file is None or spreadsheet_name is None:
        uploads = root / "uploads"
        candidates = sorted(
            list(uploads.glob("spreadsheet.*")),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            spreadsheet_path = candidates[0]
            spreadsheet_file = io.BytesIO(spreadsheet_path.read_bytes())
            spreadsheet_name = spreadsheet_path.name

    if mugshots_file is None:
        mugshots_path = root / "uploads" / "mugshots.zip"
        if mugshots_path.exists():
            mugshots_file = io.BytesIO(mugshots_path.read_bytes())

    if spreadsheet_file is None or spreadsheet_name is None:
        raise HTTPException(
            status_code=400,
            detail="Missing spreadsheet upload. Upload a spreadsheet, or reuse a workspace that already has uploads/spreadsheet.* saved.",
        )

    # Save current uploads so they can be reused later.
    if spreadsheet is not None:
        ext = Path(spreadsheet.filename).suffix.lower() or ".xlsx"
        if ext not in {".csv", ".xlsx"}:
            raise HTTPException(status_code=400, detail="Roster spreadsheet must be CSV or XLSX")
        spreadsheet_bytes = await spreadsheet.read()
        validate_spreadsheet_bytes(spreadsheet_bytes, spreadsheet.filename or f"spreadsheet{ext}", label="Roster spreadsheet")
        save_upload(workspace_id, f"uploads/spreadsheet{ext}", io.BytesIO(spreadsheet_bytes))
        # Reset spreadsheet_file/name to match what we just saved (avoid consumed stream issues).
        spreadsheet_file = io.BytesIO((root / f"uploads/spreadsheet{ext}").read_bytes())
        spreadsheet_name = f"spreadsheet{ext}"

    if mugshots_zip is not None:
        # ingest_spreadsheet also saves mugshots.zip, but we save here as well so it's available even if ingest fails.
        mugshot_bytes = await mugshots_zip.read()
        try:
            with zipfile.ZipFile(io.BytesIO(mugshot_bytes)) as zf:
                validate_zip_archive(zf, label="Portrait ZIP")
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid portrait ZIP archive") from None
        save_upload(workspace_id, "uploads/mugshots.zip", io.BytesIO(mugshot_bytes))
        mugshots_file = io.BytesIO((root / "uploads" / "mugshots.zip").read_bytes())

    try:
        return ingest_spreadsheet(
            workspace_id,
            spreadsheet_file,
            spreadsheet_name,
            mugshots_file,
            naming_pattern,
            advanced_name_match=advanced_name_match,
            filename_column=(filename_column or None),
        )
    except RosterFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/review", response_model=SpreadsheetPreview)
async def review_mapping(payload: MappingRequest, request: Request) -> SpreadsheetPreview:
    enforce_workspace_write(request, payload.workspace_id)

    people = list(payload.people)
    apply_mapping_decisions(people, list(payload.decisions))
    return SpreadsheetPreview(workspace_id=payload.workspace_id, people=people)


@router.post("/upload-image")
async def upload_image(
    request: Request,
    workspace_id: str = Form(...),
    kind: Literal["baby", "mugshot"] = Form(...),
    file: UploadFile = File(...),
    remove_background: bool = Form(False),
    background_mode: BackgroundMode = Form("simple"),
) -> dict[str, str]:
    enforce_workspace_write(request, workspace_id)

    feature_settings = get_face_detection_settings()
    background_overridden = bool(remove_background and not feature_settings.enable_background_removal_ops)
    if not feature_settings.enable_background_removal_ops:
        remove_background = False

    filename = safe_filename(Path(file.filename or "").name)
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
    if Path(filename).suffix.lower() not in allowed_exts:
        raise HTTPException(status_code=400, detail=unsupported_image_message(filename))
    # Storage layout uses `mugshots/` (plural); keep API kind as "mugshot".
    subdir = "mugshots" if kind == "mugshot" else kind

    raw = await file.read()
    validate_image_bytes(raw, label="Uploaded image")

    if kind == "baby" and remove_background:
        reserved, reason = try_reserve_bg_job(workspace_id)
        if not reserved:
            status_code = 409 if reason == "workspace_image_job_in_progress" else 503
            raise HTTPException(status_code=status_code, detail=reason, headers={"Retry-After": "10"})
        try:
            try:
                out_png = remove_background_bytes(raw, mode=background_mode)
            except Exception:
                logging.getLogger(__name__).exception("Background removal failed")
                raise HTTPException(status_code=400, detail=BACKGROUND_FAILURE) from None
        finally:
            release_bg_job(workspace_id)
        out_name = background_removed_filename(filename)
        save_upload(workspace_id, f"{subdir}/{out_name}", io.BytesIO(out_png))
        return {"filename": out_name}

    save_upload(workspace_id, f"{subdir}/{filename}", io.BytesIO(raw))
    return {"filename": filename}


@router.post("/remove-background")
async def remove_background_job(
    request: Request,
    workspace_id: str = Form(...),
    kind: Literal["baby", "mugshot"] = Form(...),
    filename: str = Form(...),
    background_mode: BackgroundMode = Form("simple"),
) -> dict[str, str]:
    enforce_workspace_write(request, workspace_id)

    """Start a background-removal job for an already-uploaded image.

    This exists so the UI can show progress/ETA while the server runs segmentation.
    """

    feature_settings = get_face_detection_settings()
    if not feature_settings.enable_background_removal_ops:
        raise HTTPException(status_code=403, detail="Background removal is disabled by admin settings")

    # Storage layout uses `mugshots/` (plural); keep API kind as "mugshot".
    subdir = "mugshots" if kind == "mugshot" else kind
    safe_name = safe_filename(filename)
    src_path = workspace_file(workspace_id, subdir, safe_name)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source image not found")

    out_name = background_removed_filename(safe_name)

    job_id = uuid4().hex
    reserved, reason = try_reserve_bg_job(workspace_id)
    if not reserved:
        status_code = 409 if reason == "workspace_image_job_in_progress" else 503
        raise HTTPException(status_code=status_code, detail=reason, headers={"Retry-After": "10"})
    try:
        start_bg_job(job_id, workspace_id, kind=kind, source_filename=safe_name, mode=background_mode, output_filename=out_name)
    except Exception:
        release_bg_job(workspace_id)
        raise

    def run():
        try:
            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=5, message="Reading image…")
            raw = src_path.read_bytes()

            # Rough but real stage progress. (GrabCut is the long pole.)
            raise_if_bg_cancelled(job_id)
            prepare_background_model(background_mode, lambda message: update_bg_job(job_id, progress=15, message=message))
            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=15, message="Removing background…")
            out_png = remove_background_bytes(raw, mode=background_mode)

            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=90, message="Saving…")
            save_upload(workspace_id, f"{subdir}/{out_name}", io.BytesIO(out_png))
            update_bg_job(job_id, progress=100, status="done", message="Done")
        except BackgroundJobCancelled:
            update_bg_job(job_id, status="cancelled", message="Cancelled")
        except Exception as exc:
            logging.getLogger(__name__).exception("Background removal failed")
            update_bg_job(job_id, error=BACKGROUND_FAILURE, message="Failed")
        finally:
            release_bg_job(workspace_id)

    try:
        Thread(target=run, daemon=True).start()
    except Exception:
        release_bg_job(workspace_id)
        raise
    return {"job_id": job_id, "output_filename": out_name}


@router.get("/remove-background-status")
async def remove_background_status(job_id: str, request: Request):
    job = get_bg_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    enforce_workspace_read(request, str(job.get("workspace_id") or ""))
    return to_status_payload(job)


@router.post("/remove-background-cancel")
async def remove_background_cancel(request: Request, job_id: str = Form(...)):
    job = get_bg_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    enforce_workspace_write(request, str(job.get("workspace_id") or ""))
    request_bg_cancel(job_id)
    return {"ok": True}


@router.post("/remove-background-preview")
async def remove_background_preview_job(
    request: Request,
    workspace_id: str = Form(...),
    kind: Literal["baby", "mugshot"] = Form(...),
    filename: str = Form(...),
    background_mode: BackgroundMode = Form("simple"),
    force: bool = Form(False),
) -> dict[str, str]:
    enforce_workspace_write(request, workspace_id)

    """Start a non-destructive background-removal job.

    Produces a PNG (with alpha) in-memory for preview in the editor.
    Nothing is written to disk unless the user later clicks Apply in the UI.
    """

    feature_settings = get_face_detection_settings()
    if not feature_settings.enable_background_removal_ops:
        raise HTTPException(status_code=403, detail="Background removal is disabled by admin settings")

    subdir = "mugshots" if kind == "mugshot" else kind
    safe_name = safe_filename(filename)
    src_path = workspace_file(workspace_id, subdir, safe_name)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source image not found")

    job_id = uuid4().hex
    reserved, reason = try_reserve_bg_job(workspace_id)
    if not reserved:
        status_code = 409 if reason == "workspace_image_job_in_progress" else 503
        raise HTTPException(status_code=status_code, detail=reason, headers={"Retry-After": "10"})
    # output_filename is informational here.
    out_name = background_removed_filename(safe_name)
    try:
        start_bg_job(job_id, workspace_id, kind=kind, source_filename=safe_name, mode=background_mode, output_filename=out_name)
    except Exception:
        release_bg_job(workspace_id)
        raise

    def run():
        try:
            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=5, message="Reading image…")
            raw = src_path.read_bytes()

            raise_if_bg_cancelled(job_id)
            prepare_background_model(background_mode, lambda message: update_bg_job(job_id, progress=15, message=message))
            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=15, message="Removing background…")
            try:
                out_png = remove_background_bytes(raw, mode=background_mode, force=force, report_already_removed=True)
            except BackgroundAlreadyRemovedError:
                raise_if_bg_cancelled(job_id)
                # Signal the UI to offer a Force action.
                update_bg_job(
                    job_id,
                    progress=100,
                    status="done",
                    message="Background already removed",
                    already_removed=True,
                )
                return

            raise_if_bg_cancelled(job_id)
            update_bg_job(job_id, progress=95, message="Finalizing…")
            update_bg_job(job_id, result_bytes=out_png)
            update_bg_job(job_id, progress=100, status="done", message="Done")
        except BackgroundJobCancelled:
            update_bg_job(job_id, status="cancelled", message="Cancelled")
        except Exception as exc:
            logging.getLogger(__name__).exception("Background removal failed")
            update_bg_job(job_id, error=BACKGROUND_FAILURE, message="Failed")
        finally:
            release_bg_job(workspace_id)

    try:
        Thread(target=run, daemon=True).start()
    except Exception:
        release_bg_job(workspace_id)
        raise
    return {"job_id": job_id}


@router.get("/remove-background-preview-result")
async def remove_background_preview_result(job_id: str, request: Request):
    job = get_bg_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    enforce_workspace_read(request, str(job.get("workspace_id") or ""))
    if job.get("status") != "done":
        raise HTTPException(status_code=409, detail="Job not completed")
    b = bytes(job.get("result_bytes") or b"")
    if not b:
        raise HTTPException(status_code=404, detail="Preview not available")
    return Response(content=b, media_type="image/png")


@router.post("/upload-baby-zip", response_model=SpreadsheetPreview)
async def upload_baby_zip(
    request: Request,
    workspace_id: str = Form(...),
    people_json: str = Form(...),
    baby_zip: UploadFile | None = File(None),
    advanced_name_match: bool = Form(True),
    partial_name_match: bool = Form(False),
    convert_pdfs: bool = Form(False),
    remove_background: bool = Form(False),
    background_mode: BackgroundMode = Form("simple"),
) -> SpreadsheetPreview:
    enforce_workspace_write(request, workspace_id)

    feature_settings = get_face_detection_settings()
    if not feature_settings.enable_baby_photos_feature:
        raise HTTPException(status_code=403, detail="Baby photo uploads are disabled")
    background_overridden = bool(remove_background and not feature_settings.enable_background_removal_ops)
    if not feature_settings.enable_background_removal_ops:
        remove_background = False

    # Parse people passed from frontend (source of truth for indices/names).
    people = TypeAdapter(list[PersonRecord]).validate_json(people_json)
    if len(people) > 2_000:
        raise HTTPException(status_code=400, detail="Too many people in one request")

    zip_bytes: bytes | None = None
    if baby_zip is not None:
        zip_bytes = await baby_zip.read()
    else:
        saved = workspace_dir(workspace_id) / "uploads" / "baby.zip"
        if saved.exists():
            zip_bytes = saved.read_bytes()

    if not zip_bytes:
        raise HTTPException(
            status_code=400,
            detail="Missing baby ZIP upload. Upload a ZIP, or reuse a workspace that already has uploads/baby.zip saved.",
        )

    target_dir = workspace_dir(workspace_id) / "baby"
    target_dir.mkdir(parents=True, exist_ok=True)

    warnings: list[str] = []
    if background_overridden:
        warnings.append("Background removal is turned off by your administrator, so original baby photos were kept.")

    # Precompute name tokens.
    people_tokens: dict[int, tuple[list[str], list[str]]] = {}
    if advanced_name_match:
        for p in people:
            first_parts = [t for t in name_tokens(p.first_name) if len(t) >= 2]
            last_parts = [t for t in name_tokens(p.last_name) if len(t) >= 2]
            if not first_parts or not last_parts:
                continue
            first_candidates = list(dict.fromkeys([first_parts[0], first_parts[-1]]))
            people_tokens[p.index] = (first_candidates, last_parts)

    assigned: set[int] = set()
    used_names: set[str] = set()

    async def _abort_if_disconnected() -> None:
        # When the UI's Stop button is pressed, the browser aborts the request.
        # FastAPI can observe the disconnect; stop quickly to avoid wasted CPU.
        if await request.is_disconnected():
            raise HTTPException(status_code=499, detail="Client disconnected")

    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid baby-photo ZIP archive") from None

    with archive as zf:
        archive_members = validate_zip_archive(zf, label="Baby-photo ZIP")
        if baby_zip is not None:
            save_upload(workspace_id, "uploads/baby.zip", io.BytesIO(zip_bytes))
        for member_info in archive_members:
            await _abort_if_disconnected()
            member = member_info.filename
            if is_archive_junk(member):
                continue
            filename_only = safe_filename(Path(member).name)
            suffix = Path(filename_only).suffix.lower()
            is_pdf = suffix == ".pdf"
            if suffix not in image_exts and not (convert_pdfs and is_pdf):
                if is_pdf:
                    reason = 'enable "Convert PDFs in baby ZIP" to use this file'
                else:
                    reason = unsupported_image_message(filename_only)
                warnings.append(f"Skipped baby file '{filename_only}': {reason}.")
                continue
            stem_raw = Path(filename_only).stem
            stem_compact_name = _compact_filename_name(stem_raw)

            match_indices: list[int] = []
            if advanced_name_match and people_tokens:
                match_indices = match_people(stem_raw, people_tokens)

            # Last resort: partial character similarity only when there was no name match.
            # This is intentionally conservative to avoid wrong assignments.
            if not match_indices and partial_name_match and advanced_name_match:
                # Require a minimum length so short filenames don't match incorrectly.
                if len(stem_compact_name) >= 8:
                    best_idx, best_score, second_score = _best_partial_name_match(stem_compact_name, people)
                    # "Most characters match" threshold + uniqueness guard.
                    if best_idx is not None and best_score >= 0.86 and (best_score - second_score) >= 0.03:
                        match_indices = [best_idx]
                        warnings.append(
                            f"Assigned baby photo '{filename_only}' to person {best_idx} (partial name match; score={best_score:.2f})."
                        )
                    elif best_idx is not None and best_score >= 0.86:
                        warnings.append(
                            f"Skipped baby photo '{filename_only}' (partial name match ambiguous; best score={best_score:.2f}, second={second_score:.2f})."
                        )

            if len(match_indices) == 1:
                person_index = match_indices[0]
                if person_index in assigned:
                    warnings.append(
                        f"Skipped baby photo '{filename_only}' (multiple files match person {person_index} by name)."
                    )
                    continue
                await _abort_if_disconnected()
                raw_content = read_zip_member(zf, member_info)

                out_name = filename_only
                content = raw_content
                if is_pdf:
                    try:
                        content, page_count = _pdf_first_page_to_png_bytes(raw_content)
                        out_name = f"{Path(filename_only).stem}.png"
                        if page_count > 1:
                            warnings.append(
                                f"Converted '{filename_only}' to '{out_name}' (used first page only; {page_count} pages total)."
                            )
                    except Exception as exc:
                        warnings.append(f"Skipped baby file '{filename_only}' (PDF conversion failed: {exc}).")
                        continue
                else:
                    try:
                        validate_image_bytes(content, label=f"Baby photo '{filename_only}'")
                    except UnsafeUpload as exc:
                        warnings.append(f"Skipped '{filename_only}': {exc}")
                        continue

                # Keep a validated original as the fallback, including converted PDFs.
                try:
                    validate_image_bytes(content, label=f"Baby photo '{out_name}'")
                except UnsafeUpload as exc:
                    warnings.append(f"Skipped '{filename_only}': {exc}")
                    continue

                background_removal_failed = False
                if remove_background:
                    await _abort_if_disconnected()
                    try:
                        processed = remove_background_bytes(content, mode=background_mode)
                        validate_image_bytes(processed, label=f"Processed baby photo '{out_name}'")
                    except Exception:
                        background_removal_failed = True
                        person = next(p for p in people if p.index == person_index)
                        full_name = f"{person.first_name} {person.last_name}".strip()
                        warnings.append(
                            f"Background removal failed for {full_name}'s photo; the original photo was kept."
                        )
                    else:
                        content = processed
                        out_name = background_removed_filename(out_name, person_index=person_index)
                    await _abort_if_disconnected()

                stored = unique_stored_name(used_names, safe_filename(out_name))
                out_path = save_upload(workspace_id, f"baby/{stored}", io.BytesIO(content))
                for i, p in enumerate(people):
                    if p.index == person_index:
                        people[i] = p.model_copy(update={
                            "baby_photo_filename": out_path.name,
                            "baby_background_removal_failed": background_removal_failed,
                        })
                        break
                assigned.add(person_index)
            elif len(match_indices) > 1:
                warnings.append(
                    f"Skipped baby photo '{filename_only}' (matches multiple people by name)."
                )
            else:
                warnings.append(
                    f"Skipped baby photo '{filename_only}' (no name match)."
                )

    return SpreadsheetPreview(workspace_id=workspace_id, people=people, warnings=warnings)


@router.post("/upload-quotes-spreadsheet", response_model=SpreadsheetPreview)
async def upload_quotes_spreadsheet(
    request: Request,
    workspace_id: str = Form(...),
    people_json: str = Form(...),
    quotes_spreadsheet: UploadFile | None = File(None),
    advanced_name_match: bool = Form(True),
) -> SpreadsheetPreview:
    enforce_workspace_write(request, workspace_id)

    if not get_face_detection_settings().enable_quotes_feature:
        raise HTTPException(status_code=403, detail="Quote uploads are disabled")

    people = TypeAdapter(list[PersonRecord]).validate_json(people_json)
    if len(people) > 2_000:
        raise HTTPException(status_code=400, detail="Too many people in one request")

    data: bytes | None = None
    filename: str | None = None
    if quotes_spreadsheet is not None:
        filename = quotes_spreadsheet.filename
        data = await quotes_spreadsheet.read()
        # Persist for later re-processing even if parsing fails.
        ext = Path(filename).suffix.lower() if filename else ".xlsx"
        if ext not in {".csv", ".xlsx"}:
            raise HTTPException(status_code=400, detail="Quotes spreadsheet must be CSV or XLSX")
        validate_spreadsheet_bytes(data, filename or f"quotes{ext}", label="Quotes spreadsheet")
        save_upload(workspace_id, f"uploads/quotes{ext}", io.BytesIO(data))
    else:
        root = workspace_dir(workspace_id) / "uploads"
        candidates = sorted(list(root.glob("quotes.*")), key=lambda p: p.stat().st_mtime, reverse=True)
        if candidates:
            filename = candidates[0].name
            data = candidates[0].read_bytes()

    if not data or not filename:
        raise HTTPException(
            status_code=400,
            detail="Missing quotes spreadsheet. Upload one, or reuse a workspace that already has uploads/quotes.* saved.",
        )

    validate_spreadsheet_bytes(data, filename, label="Quotes spreadsheet")

    buf = io.BytesIO(data)
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(buf, dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(buf, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read quotes spreadsheet: {exc}")

    if len(df) > 5_000:
        raise HTTPException(status_code=400, detail="Quotes spreadsheet contains more than 5,000 rows")

    warnings: list[str] = []

    # Build person token index for matching
    person_tokens: dict[int, tuple[list[str], list[str]]] = {}
    if advanced_name_match:
        for p in people:
            first_parts = [t for t in name_tokens(p.first_name) if len(t) >= 2]
            last_parts = [t for t in name_tokens(p.last_name) if len(t) >= 2]
            if not first_parts or not last_parts:
                continue
            first_candidates = list(dict.fromkeys([first_parts[0], first_parts[-1]]))
            person_tokens[p.index] = (first_candidates, last_parts)

    # Identify name columns if present
    lower_cols = {str(c).lower(): c for c in df.columns}
    first_col = None
    last_col = None
    name_col = None
    quote_col = None
    for low, orig in lower_cols.items():
        if first_col is None and "first" in low and "name" in low:
            first_col = orig
        if last_col is None and "last" in low and "name" in low:
            last_col = orig
        if name_col is None and low.strip() in {"name", "student name", "full name"}:
            name_col = orig
        if quote_col is None and "quote" in low:
            quote_col = orig

    def row_name_tokens(row) -> tuple[str, set[str], str]:
        raw_name = ""
        if first_col is not None and last_col is not None:
            if first_col == last_col:
                raw_name = str(row.get(first_col, ""))
            else:
                raw_name = f"{row.get(first_col, '')} {row.get(last_col, '')}"
        elif name_col is not None:
            raw_name = str(row.get(name_col, ""))
        else:
            # Fallback: try to find any column containing 'name'
            for col in df.columns:
                if "name" in str(col).lower():
                    raw_name = str(row.get(col, ""))
                    break
        stem_norm = normalize_name(raw_name)
        return (raw_name, set(stem_norm.split()) if stem_norm else set(), compact_name(raw_name))

    def _truncate(value: object, limit: int = 60) -> str:
        s = "" if value is None else str(value)
        return s if len(s) <= limit else s[:limit]

    def _display_name(person_index: int) -> str:
        person = next((p for p in people if p.index == person_index), None)
        if person is None:
            return f"person {person_index}"
        full = f"{person.first_name} {person.last_name}".strip()
        return full or f"person {person_index}"

    has_name_column = (
        (first_col is not None and last_col is not None)
        or name_col is not None
        or any("name" in str(c).lower() for c in df.columns)
    )
    if not has_name_column:
        return SpreadsheetPreview(
            workspace_id=workspace_id,
            people=list(people),
            warnings=[
                "The quotes spreadsheet has no student name column, so quotes could not be matched. "
                "Add 'First Name' and 'Last Name' columns (or one 'Name' column)."
            ],
        )

    updated = {p.index: p for p in people}
    applied = 0

    for row_idx, row in df.iterrows():
        raw_name, stem_tokens, stem_compact = row_name_tokens(row)
        if not stem_tokens and not stem_compact:
            continue

        matches: list[int] = []
        if advanced_name_match and person_tokens:
            matches = match_people(raw_name, person_tokens)
        if len(matches) != 1:
            if len(matches) > 1:
                warnings.append(f"Row {row_idx + 2}: matches multiple people by name")
            else:
                warnings.append(f"Row {row_idx + 2}: no student matched the name \"{_truncate(raw_name)}\".")
            continue

        person_index = matches[0]

        # 1) Prefer an explicit "quote" column if present: accept any non-empty
        # cell that is not a link or email. Heuristic quote detection
        # (_looks_like_quote) applies only to the fallback scan below.
        if quote_col is not None:
            val = row.get(quote_col)
            s = "" if val is None or (isinstance(val, float) and pd.isna(val)) else str(val).strip()
            if not s:
                warnings.append(f"Row {row_idx + 2}: {_display_name(person_index)} — the quote cell is empty.")
                continue
            if _looks_like_url(s) or _looks_like_email(s):
                warnings.append(
                    f"Row {row_idx + 2}: {_display_name(person_index)} — the quote cell looks like a link or email, so it was not used."
                )
                continue
            if _is_placeholder_quote(s):
                warnings.append(
                    f"Row {row_idx + 2}: {_display_name(person_index)} — the quote cell says \"{_truncate(s)}\", which looks like a placeholder, so no quote was used."
                )
                continue
            updated[person_index] = updated[person_index].model_copy(update={"quote": s})
            applied += 1
            continue

        # 2) No explicit quote column: scan the row for the best quote-like cell.
        candidates: list[str] = []
        for col in df.columns:
            if col in {first_col, last_col, name_col}:
                continue
            val = row.get(col)
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            s = str(val).strip()
            if not s:
                continue
            candidates.append(s)

        quote_candidates = [c for c in candidates if _looks_like_quote(c) and not _is_placeholder_quote(c)]
        if not quote_candidates:
            warnings.append(
                f"Row {row_idx + 2}: {_display_name(person_index)} — no quote-like text found, so no quote was used."
            )
            continue
        preferred = max(quote_candidates, key=lambda s: len(s))

        quote = preferred
        updated[person_index] = updated[person_index].model_copy(update={"quote": quote})
        applied += 1

    if applied == 0:
        warnings.insert(
            0,
            "No rows matched a student on the roster. Check that the names in the quotes sheet match the roster spelling.",
        )

    # preserve original order
    out_people = [updated[p.index] for p in people]
    return SpreadsheetPreview(workspace_id=workspace_id, people=out_people, warnings=warnings)


@router.get("/assets")
async def list_assets(workspace_id: str, kind: Literal["baby", "mugshot"], request: Request):
    enforce_workspace_read(request, workspace_id)
    from app.services.asset_catalog import list_asset_names

    return {"filenames": list_asset_names(workspace_dir(workspace_id), kind)}


@router.api_route("/asset", methods=["GET", "HEAD"])
async def get_asset(workspace_id: str, kind: Literal["baby", "mugshot"], filename: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    safe_name = safe_filename(filename)
    if kind == "mugshot":
        # Canonical folder is `mugshots/`; fall back to legacy `mugshot/`.
        candidate_dirs = ["mugshots", "mugshot"]
    else:
        candidate_dirs = [kind]

    for dir_name in candidate_dirs:
        path = workspace_file(workspace_id, dir_name, safe_name)
        if path.exists():
            media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            return FileResponse(path, media_type=media_type)

    raise HTTPException(status_code=404, detail="not found")
