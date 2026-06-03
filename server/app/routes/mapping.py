from __future__ import annotations

from pathlib import Path
from typing import Literal
import io
import zipfile
import re
from difflib import SequenceMatcher

from pydantic import TypeAdapter
import pandas as pd

import mimetypes

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request

from app.models.schemas import MappingRequest, MappingDecision, PersonRecord, SpreadsheetPreview
from app.services.mapping_review import apply_mapping_decisions
from app.services.spreadsheet import ingest_spreadsheet
from app.services.storage import save_upload, workspace_dir
from app.services.background_removal import (
    BackgroundMode,
    background_removed_filename,
    remove_background as remove_background_bytes,
    BackgroundAlreadyRemovedError,
)
from app.services.background_jobs import (
    start_job as start_bg_job,
    update_job as update_bg_job,
    get_job as get_bg_job,
    pop_result_bytes as pop_bg_result_bytes,
    to_status_payload,
)
from app.services.admin_settings import get_face_detection_settings
from app.services.generator import detect_face_center
from app.services.workspace_registry import ensure_workspace_write_access
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from uuid import uuid4
from threading import Thread
import time

router = APIRouter()


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


def _pdf_first_page_to_png_bytes(pdf_bytes: bytes, *, dpi: int = 200) -> tuple[bytes, int]:
    """Render the first page of a PDF to PNG bytes.

    Returns: (png_bytes, page_count)
    """

    if not pdf_bytes:
        raise ValueError("Empty PDF")
    try:
        import fitz  # PyMuPDF
    except Exception as exc:
        raise RuntimeError("PyMuPDF not installed") from exc

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_count = int(getattr(doc, "page_count", 0) or 0)
        if page_count <= 0:
            raise ValueError("PDF has no pages")
        page = doc.load_page(0)
        scale = float(dpi) / 72.0
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return pix.tobytes("png"), page_count
    finally:
        doc.close()


@router.get("/baby-mask")
async def get_baby_mask(
    workspace_id: str,
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

    path = workspace_dir(workspace_id) / "masks" / "baby" / f"{int(x)}_{int(y)}_{int(width)}_{int(height)}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Mask not found")
    return FileResponse(path, media_type="image/png")


@router.post("/detect-face-center")
async def detect_face_center_api(image: UploadFile = File(...)):
    """Detect the face center in an arbitrary uploaded image.

    This is used by the baby-photo editor to auto-center the crop on a face.
    """

    try:
        raw = await image.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image")
        from PIL import Image, ImageOps

        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image")

    from app.services.face_detection import detect_face_box_for_editor_with_meta

    result = detect_face_box_for_editor_with_meta(img)
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


def _normalize_name(text: str) -> str:
    lowered = (text or "").lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def _tokens(text: str) -> list[str]:
    norm = _normalize_name(text)
    return norm.split() if norm else []


def _compact(text: str) -> str:
    return re.sub(r"\s+", "", _normalize_name(text))


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

    norm = _normalize_name(stem_raw)
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


def _matches_name(stem_tokens: set[str], stem_compact: str, first_parts: list[str], last_parts: list[str]) -> bool:
    if not first_parts or not last_parts:
        return False
    first_present = any(t in stem_tokens for t in first_parts)
    last_present = any(t in stem_tokens for t in last_parts)
    if first_present and last_present:
        return True
    first_compact = "".join(first_parts)
    last_compact = "".join(last_parts)
    return (first_compact in stem_compact and last_compact in stem_compact) or (
        last_compact in stem_compact and first_compact in stem_compact
    )


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
        full_a = _compact(f"{p.first_name} {p.last_name}")
        full_b = _compact(f"{p.last_name} {p.first_name}")
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
    naming_pattern: str = Form(r"\d{3,4}"),
    advanced_name_match: bool = Form(False),
) -> SpreadsheetPreview:
    _enforce_workspace_write_access(request, workspace_id)

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
        save_upload(workspace_id, f"uploads/spreadsheet{ext}", io.BytesIO(await spreadsheet.read()))
        # Reset spreadsheet_file/name to match what we just saved (avoid consumed stream issues).
        spreadsheet_file = io.BytesIO((root / f"uploads/spreadsheet{ext}").read_bytes())
        spreadsheet_name = f"spreadsheet{ext}"

    if mugshots_zip is not None:
        # ingest_spreadsheet also saves mugshots.zip, but we save here as well so it's available even if ingest fails.
        save_upload(workspace_id, "uploads/mugshots.zip", io.BytesIO(await mugshots_zip.read()))
        mugshots_file = io.BytesIO((root / "uploads" / "mugshots.zip").read_bytes())

    return ingest_spreadsheet(
        workspace_id,
        spreadsheet_file,
        spreadsheet_name,
        mugshots_file,
        naming_pattern,
        advanced_name_match=advanced_name_match,
    )


@router.post("/review", response_model=SpreadsheetPreview)
async def review_mapping(payload: MappingRequest, request: Request) -> SpreadsheetPreview:
    _enforce_workspace_write_access(request, payload.workspace_id)

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
    _enforce_workspace_write_access(request, workspace_id)

    feature_settings = get_face_detection_settings()
    if kind == "baby" and not feature_settings.enable_background_removal_ops:
        remove_background = False

    filename = Path(file.filename).name
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
    if Path(filename).suffix.lower() not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only image files are supported (.png, .jpg, .jpeg, .webp, .bmp, .tif, .tiff)")
    # Storage layout uses `mugshots/` (plural); keep API kind as "mugshot".
    subdir = "mugshots" if kind == "mugshot" else kind

    if kind == "baby" and remove_background:
        raw = file.file.read()
        try:
            out_png = remove_background_bytes(raw, mode=background_mode)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not remove background: {exc}")
        out_name = background_removed_filename(filename)
        save_upload(workspace_id, f"{subdir}/{out_name}", io.BytesIO(out_png))
        return {"filename": out_name}

    save_upload(workspace_id, f"{subdir}/{filename}", file.file)
    return {"filename": filename}


@router.post("/remove-background")
async def remove_background_job(
    request: Request,
    workspace_id: str = Form(...),
    kind: Literal["baby", "mugshot"] = Form(...),
    filename: str = Form(...),
    background_mode: BackgroundMode = Form("simple"),
) -> dict[str, str]:
    _enforce_workspace_write_access(request, workspace_id)

    """Start a background-removal job for an already-uploaded image.

    This exists so the UI can show progress/ETA while the server runs segmentation.
    """

    feature_settings = get_face_detection_settings()
    if kind == "baby" and not feature_settings.enable_background_removal_ops:
        raise HTTPException(status_code=403, detail="Background removal is disabled by admin settings")

    # Storage layout uses `mugshots/` (plural); keep API kind as "mugshot".
    subdir = "mugshots" if kind == "mugshot" else kind
    safe_name = Path(filename).name
    src_path = workspace_dir(workspace_id) / subdir / safe_name
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source image not found")

    out_name = background_removed_filename(safe_name)
    out_path = workspace_dir(workspace_id) / subdir / out_name

    job_id = uuid4().hex
    start_bg_job(job_id, workspace_id, kind=kind, source_filename=safe_name, mode=background_mode, output_filename=out_name)

    def run():
        try:
            update_bg_job(job_id, progress=5, message="Reading image…")
            raw = src_path.read_bytes()

            # Rough but real stage progress. (GrabCut is the long pole.)
            update_bg_job(job_id, progress=15, message="Removing background…")
            out_png = remove_background_bytes(raw, mode=background_mode)

            update_bg_job(job_id, progress=90, message="Saving…")
            save_upload(workspace_id, f"{subdir}/{out_name}", io.BytesIO(out_png))
            update_bg_job(job_id, progress=100, status="done", message="Done")
        except Exception as exc:
            update_bg_job(job_id, error=str(exc), message="Failed")

    Thread(target=run, daemon=True).start()
    return {"job_id": job_id, "output_filename": out_name}


@router.get("/remove-background-status")
async def remove_background_status(job_id: str):
    job = get_bg_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return to_status_payload(job)


@router.post("/remove-background-preview")
async def remove_background_preview_job(
    request: Request,
    workspace_id: str = Form(...),
    kind: Literal["baby", "mugshot"] = Form(...),
    filename: str = Form(...),
    background_mode: BackgroundMode = Form("simple"),
    force: bool = Form(False),
) -> dict[str, str]:
    _enforce_workspace_write_access(request, workspace_id)

    """Start a non-destructive background-removal job.

    Produces a PNG (with alpha) in-memory for preview in the editor.
    Nothing is written to disk unless the user later clicks Apply in the UI.
    """

    feature_settings = get_face_detection_settings()
    if kind == "baby" and not feature_settings.enable_background_removal_ops:
        raise HTTPException(status_code=403, detail="Background removal is disabled by admin settings")

    subdir = "mugshots" if kind == "mugshot" else kind
    safe_name = Path(filename).name
    src_path = workspace_dir(workspace_id) / subdir / safe_name
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source image not found")

    job_id = uuid4().hex
    # output_filename is informational here.
    out_name = background_removed_filename(safe_name)
    start_bg_job(job_id, workspace_id, kind=kind, source_filename=safe_name, mode=background_mode, output_filename=out_name)

    def run():
        try:
            update_bg_job(job_id, progress=5, message="Reading image…")
            raw = src_path.read_bytes()

            update_bg_job(job_id, progress=15, message="Removing background…")
            try:
                out_png = remove_background_bytes(raw, mode=background_mode, force=force, report_already_removed=True)
            except BackgroundAlreadyRemovedError:
                # Signal the UI to offer a Force action.
                update_bg_job(
                    job_id,
                    progress=100,
                    status="done",
                    message="Background already removed",
                    already_removed=True,
                )
                return

            update_bg_job(job_id, progress=95, message="Finalizing…")
            update_bg_job(job_id, result_bytes=out_png)
            update_bg_job(job_id, progress=100, status="done", message="Done")
        except Exception as exc:
            update_bg_job(job_id, error=str(exc), message="Failed")

    Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@router.get("/remove-background-preview-result")
async def remove_background_preview_result(job_id: str):
    job = get_bg_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=409, detail="Job not completed")
    b = pop_bg_result_bytes(job_id)
    if not b:
        raise HTTPException(status_code=410, detail="Preview already fetched")
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
    _enforce_workspace_write_access(request, workspace_id)

    feature_settings = get_face_detection_settings()
    if not feature_settings.enable_background_removal_ops:
        remove_background = False

    # Parse people passed from frontend (source of truth for indices/names).
    people = TypeAdapter(list[PersonRecord]).validate_json(people_json)

    zip_bytes: bytes | None = None
    if baby_zip is not None:
        zip_bytes = baby_zip.file.read()
        save_upload(workspace_id, "uploads/baby.zip", io.BytesIO(zip_bytes))
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

    # Precompute name tokens.
    name_tokens: dict[int, tuple[list[str], list[str]]] = {}
    if advanced_name_match:
        for p in people:
            first_parts = [t for t in _tokens(p.first_name) if len(t) >= 2]
            last_parts = [t for t in _tokens(p.last_name) if len(t) >= 2]
            if not first_parts or not last_parts:
                continue
            first_candidates = list(dict.fromkeys([first_parts[0], first_parts[-1]]))
            name_tokens[p.index] = (first_candidates, last_parts)

    assigned: set[int] = set()

    async def _abort_if_disconnected() -> None:
        # When the UI's Stop button is pressed, the browser aborts the request.
        # FastAPI can observe the disconnect; stop quickly to avoid wasted CPU.
        if await request.is_disconnected():
            raise HTTPException(status_code=499, detail="Client disconnected")

    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for member in zf.namelist():
            await _abort_if_disconnected()
            if member.endswith("/"):
                continue
            filename_only = Path(member).name
            suffix = Path(filename_only).suffix.lower()
            is_pdf = suffix == ".pdf"
            if suffix not in image_exts and not (convert_pdfs and is_pdf):
                warnings.append(f"Skipped baby file '{filename_only}' (unsupported type; images only).")
                continue
            stem_raw = Path(filename_only).stem
            stem_norm = _normalize_name(stem_raw)
            stem_tokens = set(stem_norm.split()) if stem_norm else set()
            stem_compact = _compact(stem_raw)
            stem_compact_name = _compact_filename_name(stem_raw)

            match_indices: list[int] = []
            if advanced_name_match and name_tokens:
                for person_index, (first_parts, last_parts) in name_tokens.items():
                    if _matches_name(stem_tokens, stem_compact, first_parts, last_parts):
                        match_indices.append(person_index)

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
                with zf.open(member) as src:
                    raw_content = src.read()

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

                if remove_background:
                    await _abort_if_disconnected()
                    try:
                        content = remove_background_bytes(content, mode=background_mode)
                        out_name = background_removed_filename(out_name, person_index=person_index)
                    except Exception as exc:
                        warnings.append(
                            f"Skipped baby photo '{filename_only}' for person {person_index} (background removal failed: {exc})."
                        )
                        continue
                    await _abort_if_disconnected()

                out_path = target_dir / out_name
                out_path.write_bytes(content)
                for i, p in enumerate(people):
                    if p.index == person_index:
                        people[i] = p.model_copy(update={"baby_photo_filename": out_path.name})
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
    _enforce_workspace_write_access(request, workspace_id)

    people = TypeAdapter(list[PersonRecord]).validate_json(people_json)

    data: bytes | None = None
    filename: str | None = None
    if quotes_spreadsheet is not None:
        filename = quotes_spreadsheet.filename
        data = quotes_spreadsheet.file.read()
        # Persist for later re-processing even if parsing fails.
        ext = Path(filename).suffix.lower() if filename else ".xlsx"
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

    buf = io.BytesIO(data)
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(buf)
        else:
            df = pd.read_excel(buf)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read quotes spreadsheet: {exc}")

    warnings: list[str] = []

    # Build person token index for matching
    person_tokens: dict[int, tuple[list[str], list[str]]] = {}
    if advanced_name_match:
        for p in people:
            first_parts = [t for t in _tokens(p.first_name) if len(t) >= 2]
            last_parts = [t for t in _tokens(p.last_name) if len(t) >= 2]
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

    def row_name_tokens(row) -> tuple[set[str], str]:
        raw_name = ""
        if first_col is not None and last_col is not None:
            raw_name = f"{row.get(first_col, '')} {row.get(last_col, '')}"
        elif name_col is not None:
            raw_name = str(row.get(name_col, ""))
        else:
            # Fallback: try to find any column containing 'name'
            for col in df.columns:
                if "name" in str(col).lower():
                    raw_name = str(row.get(col, ""))
                    break
        stem_norm = _normalize_name(raw_name)
        return (set(stem_norm.split()) if stem_norm else set(), _compact(raw_name))

    updated = {p.index: p for p in people}

    for row_idx, row in df.iterrows():
        stem_tokens, stem_compact = row_name_tokens(row)
        if not stem_tokens and not stem_compact:
            continue

        matches: list[int] = []
        if advanced_name_match and person_tokens:
            for person_index, (first_parts, last_parts) in person_tokens.items():
                if _matches_name(stem_tokens, stem_compact, first_parts, last_parts):
                    matches.append(person_index)
        if len(matches) != 1:
            if len(matches) > 1:
                warnings.append(f"Row {row_idx + 2}: matches multiple people by name")
            else:
                warnings.append(f"Row {row_idx + 2}: no name match")
            continue

        person_index = matches[0]

        # 1) Prefer an explicit "quote" column if present.
        preferred = None
        if quote_col is not None:
            val = row.get(quote_col)
            if val is not None and not (isinstance(val, float) and pd.isna(val)):
                s = str(val).strip()
                if s and _looks_like_quote(s):
                    preferred = s

        # 2) Fall back to scanning the row for the best quote-like cell.
        if preferred is None:
            candidates: list[str] = []
            for col in df.columns:
                if col in {first_col, last_col, name_col, quote_col}:
                    continue
                val = row.get(col)
                if val is None or (isinstance(val, float) and pd.isna(val)):
                    continue
                s = str(val).strip()
                if not s:
                    continue
                candidates.append(s)

            quote_candidates = [c for c in candidates if _looks_like_quote(c)]
            if not quote_candidates:
                # If quote column exists but didn't pass heuristics, include that detail.
                if quote_col is not None:
                    raw = row.get(quote_col)
                    raw_s = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw).strip()
                    if raw_s:
                        warnings.append(
                            f"Row {row_idx + 2}: matched person {person_index} but '{quote_col}' did not look like a quote"
                        )
                    else:
                        warnings.append(f"Row {row_idx + 2}: matched person {person_index} but '{quote_col}' was empty")
                else:
                    warnings.append(f"Row {row_idx + 2}: matched person {person_index} but no quote-like text found")
                continue
            preferred = max(quote_candidates, key=lambda s: len(s))

        quote = preferred
        updated[person_index] = updated[person_index].model_copy(update={"quote": quote})

    # preserve original order
    out_people = [updated[p.index] for p in people]
    return SpreadsheetPreview(workspace_id=workspace_id, people=out_people, warnings=warnings)


@router.get("/asset")
async def get_asset(workspace_id: str, kind: Literal["baby", "mugshot"], filename: str):
    root = workspace_dir(workspace_id)
    if kind == "mugshot":
        # Canonical folder is `mugshots/`; fall back to legacy `mugshot/`.
        candidate_dirs = ["mugshots", "mugshot"]
    else:
        candidate_dirs = [kind]

    for dir_name in candidate_dirs:
        path = root / dir_name / filename
        if path.exists():
            media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            return FileResponse(path, media_type=media_type)

    raise HTTPException(status_code=404, detail="not found")
