from __future__ import annotations

import io
import os
import tempfile
import zipfile
from pathlib import Path
from threading import Thread
from typing import Any
from uuid import uuid4
import json
import re
import time

from fastapi import APIRouter, Request
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.models.schemas import GenerationRequest
from app.services.licensing import (
    get_device_id_from_headers,
    get_required_license_key_from_headers,
    validate_and_record_use,
)
from app.services.placement import assign_logical_slots
from app.services.licensing_usage import append_usage_event
from app.services.admin_settings import get_face_detection_settings
from app.services.generator import generate_composite
from app.services.storage import restrict_file_permissions, safe_filename, workspace_dir, workspace_file
from app.services.progress import (
    GenerationCancelled,
    get_job,
    raise_if_cancelled,
    release_generation,
    request_cancel,
    start_job,
    append_warning,
    try_reserve_generation,
    update_job,
)
from app.routes.workspace_access import enforce_workspace_read, enforce_workspace_write

router = APIRouter()


_SAFE_BASENAME_RE = re.compile(r"[^0-9A-Za-z._-]+")


_OUTPUT_EXTS = {".png", ".pdf", ".tif", ".tiff"}


_SPREAD_NUM_RE = re.compile(r"^output_(\d+)$")


def _list_output_files(root) -> list:
    """Return the most recent render's spread files, ordered by spread number.

    A workspace can hold leftovers from earlier renders in other formats; only the
    extension group with the newest file is returned.
    """
    candidates = [p for p in root.glob("output*") if p.is_file() and p.suffix.lower() in _OUTPUT_EXTS]
    if not candidates:
        return []
    newest_ext = max(candidates, key=lambda p: p.stat().st_mtime).suffix.lower()
    group = [p for p in candidates if p.suffix.lower() == newest_ext]
    spreads = [p for p in group if _SPREAD_NUM_RE.match(p.stem)]
    if spreads:
        return sorted(spreads, key=lambda p: int(_SPREAD_NUM_RE.match(p.stem).group(1)))
    return [p for p in group if p.stem == "output"][:1]


def _clear_previous_outputs(root, keep: str) -> None:
    """Delete output.* / output_*.* files (any format) except `keep`. Never touches preview.*."""
    for p in root.glob("output*"):
        if p.is_file() and p.name != keep and p.suffix.lower() in _OUTPUT_EXTS and (p.stem == "output" or _SPREAD_NUM_RE.match(p.stem)):
            try:
                p.unlink()
            except OSError:
                pass


def _find_preview_file(root) -> str | None:
    for ext in sorted(_OUTPUT_EXTS):
        preview = root / f"preview{ext}"
        if preview.exists():
            return preview.name
    return None


def _safe_basename(name: str) -> str:
    base = (name or "").split("/")[-1].split("\\")[-1].strip()
    if not base:
        return "output.png"
    base = _SAFE_BASENAME_RE.sub("_", base)
    # Avoid weird edge cases like '.' or '..'
    if base in {".", ".."}:
        return "output.png"
    return base


def _safe_excel_text(value: str) -> str:
    text = str(value or "")
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


def _save_generation_request(payload: GenerationRequest) -> None:
    """Persist the request used to generate an output.

    This enables later export of a spreadsheet containing the exact data used.
    """
    root = workspace_dir(payload.workspace_id)
    out_name = _safe_basename(payload.output_filename or "output.png")
    stem = out_name.rsplit(".", 1)[0]
    req_dir = root / "generation" / "requests"
    req_dir.mkdir(parents=True, exist_ok=True)

    data = payload.model_dump()
    data["_saved_at"] = time.time()
    data["_output_filename"] = out_name

    tmp = req_dir / f"{stem}.json.tmp"
    path = req_dir / f"{stem}.json"
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    restrict_file_permissions(tmp)
    tmp.replace(path)


@router.post("/generate")
async def generate(payload: GenerationRequest, request: Request) -> dict[str, Any]:
    enforce_workspace_write(request, payload.workspace_id)
    requested_output = _safe_basename(payload.output_filename or "output.png")
    if not (requested_output.startswith("output") or requested_output.startswith("preview")):
        raise HTTPException(status_code=400, detail="Output filename must begin with 'output' or 'preview'")
    reserved, reserve_reason = try_reserve_generation(payload.workspace_id)
    if not reserved:
        status_code = 409 if reserve_reason == "workspace_generation_in_progress" else 503
        raise HTTPException(status_code=status_code, detail=reserve_reason, headers={"Retry-After": "10"})

    feature_settings = get_face_detection_settings()
    if payload.output_format == "pdf" and not feature_settings.enable_pdf_output:
        release_generation(payload.workspace_id)
        raise HTTPException(status_code=403, detail="PDF output is disabled by admin settings")
    if payload.output_format == "tiff" and not feature_settings.enable_tiff_output:
        release_generation(payload.workspace_id)
        raise HTTPException(status_code=403, detail="TIFF output is disabled by admin settings")
    try:
        max_people = max(1, int(os.getenv("YMGA_MAX_GENERATION_PEOPLE", "1000") or "1000"))
    except ValueError:
        max_people = 1000
    if len(payload.people) > max_people or len(payload.slots) > max_people:
        release_generation(payload.workspace_id)
        raise HTTPException(status_code=400, detail=f"Generation is limited to {max_people} people/slots per job")
    centre_overridden = bool(payload.center_baby_on_face and not feature_settings.enable_center_on_face_ops)
    if not feature_settings.enable_center_on_face_ops:
        payload.center_baby_on_face = False

    usage_payload: dict[str, object] | None = None
    if payload.count_usage:
        key = getattr(request.state, "license_key", None) or get_required_license_key_from_headers(request.headers)
        device_id = getattr(request.state, "license_device_id", None) or get_device_id_from_headers(request.headers)
        forwarded = request.headers.get("x-forwarded-for")
        ip = (forwarded.split(",")[0].strip() if forwarded else None) or (request.client.host if request.client else None)

        try:
            ok, meta = validate_and_record_use(key or "", ip=ip, device_id=device_id)
        except Exception:
            release_generation(payload.workspace_id)
            raise
        if not ok:
            release_generation(payload.workspace_id)
            return JSONResponse(
                status_code=401,
                content={"detail": "License key required", "reason": meta.get("reason")},
            )

        try:
            append_usage_event(
                key=(key or "").strip().upper(),
                license_type=str(meta.get("license_type") or ""),
                ip=ip,
                device_id=device_id,
                route=str(request.url.path),
            )
        except Exception:
            # Usage was already counted in the license record; a secondary
            # analytics-log failure must not charge the user without rendering.
            pass

        usage_limit = meta.get("usage_limit")
        usage_remaining = meta.get("usage_remaining")
        usage_period = meta.get("usage_period")
        if isinstance(usage_limit, int) and isinstance(usage_remaining, int) and isinstance(usage_period, str):
            usage_payload = {
                "limit": usage_limit,
                "remaining": usage_remaining,
                "period": usage_period,
            }

    job_id = uuid4().hex
    # A new full render starts at spread 1 (or the single-file output): drop leftovers
    # from earlier renders so downloads never mix old and new spreads.
    if re.match(r"^output(_0*1)?\.[a-z]+$", requested_output):
        _clear_previous_outputs(workspace_dir(payload.workspace_id), keep=requested_output)
    try:
        start_job(job_id, payload.workspace_id)
        if centre_overridden:
            append_warning(job_id, "Centre-on-face is turned off by your administrator, so baby photos were centred normally.")
    except Exception:
        release_generation(payload.workspace_id)
        raise

    # Save the exact request used for generation so the results page can export
    # the final resolved inputs (names, filenames, quotes, spread/slot numbers).
    try:
        _save_generation_request(payload)
    except Exception:
        # Non-fatal: rendering should still proceed even if persistence fails.
        pass

    def run_generation():
        def progress_cb(pct, msg):
            raise_if_cancelled(job_id)
            update_job(job_id, progress=pct, status=msg)

        try:
            out_path = generate_composite(payload, progress_cb=progress_cb, warning_cb=lambda warning: append_warning(job_id, warning))
            update_job(job_id, progress=100, status="done", output=out_path.name)
        except GenerationCancelled:
            update_job(job_id, status="cancelled", error="generation_cancelled")
        except Exception as exc:  # pragma: no cover - defensive
            update_job(job_id, status="error", error=str(exc))
        finally:
            release_generation(payload.workspace_id)

    try:
        Thread(target=run_generation, daemon=True).start()
    except Exception:
        release_generation(payload.workspace_id)
        raise
    resp: dict[str, Any] = {"job_id": job_id}
    if usage_payload is not None:
        resp["usage"] = usage_payload
    return resp


class CancelGenerationRequest(BaseModel):
    job_id: str
    workspace_id: str


@router.post("/cancel")
async def cancel(payload: CancelGenerationRequest, request: Request) -> dict[str, Any]:
    enforce_workspace_write(request, payload.workspace_id)
    job = get_job(payload.job_id)
    if not job or job.get("workspace_id") != payload.workspace_id:
        return {"ok": False}
    return {"ok": request_cancel(payload.job_id)}


@router.get("/download")
async def download(workspace_id: str, request: Request, filename: str = "output.png"):
    enforce_workspace_read(request, workspace_id)
    safe_name = safe_filename(filename)
    if not (safe_name.startswith("output") or safe_name.startswith("preview")) or Path(safe_name).suffix.lower() not in _OUTPUT_EXTS:
        raise HTTPException(status_code=400, detail="Invalid output filename")
    path = workspace_file(workspace_id, safe_name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="This rendered file is no longer available. Render it again, then download it.")
    return FileResponse(path)


@router.get("/outputs")
async def outputs(workspace_id: str, request: Request) -> dict[str, Any]:
    enforce_workspace_read(request, workspace_id)
    root = workspace_dir(workspace_id)
    spread_files = _list_output_files(root)
    return {
        "workspace_id": workspace_id,
        "preview": _find_preview_file(root),
        "outputs": [p.name for p in spread_files],
    }


@router.get("/download-all")
async def download_all(workspace_id: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    root = workspace_dir(workspace_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="workspace not found")

    spread_files = _list_output_files(root)

    if not spread_files:
        raise HTTPException(status_code=404, detail="no rendered spreads found")

    try:
        max_archive_bytes = max(1, int(os.getenv("YMGA_MAX_DOWNLOAD_ARCHIVE_BYTES", str(2 * 1024 * 1024 * 1024))))
    except ValueError:
        max_archive_bytes = 2 * 1024 * 1024 * 1024
    total_bytes = sum(p.stat().st_size for p in spread_files)
    if total_bytes > max_archive_bytes:
        raise HTTPException(status_code=413, detail="Rendered outputs are too large to bundle on the server")

    buf = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024, mode="w+b")
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in spread_files:
            # Store just the filename in the zip root.
            zf.write(p, arcname=p.name)
    buf.seek(0)

    def stream_archive():
        try:
            while chunk := buf.read(1024 * 1024):
                yield chunk
        finally:
            buf.close()

    headers = {"Content-Disposition": "attachment; filename=spreads.zip"}
    return StreamingResponse(stream_archive(), media_type="application/zip", headers=headers)


@router.get("/download-spreadsheet")
async def download_spreadsheet(workspace_id: str, request: Request):
    enforce_workspace_read(request, workspace_id)
    """Download a spreadsheet describing the data used to generate the latest spreads.

    Columns: name, number, baby filename, portrait filename, quote, spread number, slot number.
    """
    root = workspace_dir(workspace_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="workspace not found")

    spread_files = _list_output_files(root)

    if not spread_files:
        raise HTTPException(status_code=404, detail="no rendered spreads found")

    req_dir = root / "generation" / "requests"
    if not req_dir.exists():
        raise HTTPException(status_code=404, detail="no generation requests found")

    rows: list[dict[str, object]] = []

    def parse_spread_number(fname: str, fallback: int) -> int:
        m = re.search(r"output_(\d+)\.(png|pdf|tif|tiff)$", fname, flags=re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                return fallback
        return fallback

    for i, out_path in enumerate(spread_files):
        out_name = out_path.name
        stem = out_name.rsplit(".", 1)[0]
        req_path = req_dir / f"{stem}.json"
        if not req_path.exists():
            # If we don't have inputs for a rendered output, we can't guarantee accuracy.
            raise HTTPException(status_code=404, detail=f"missing generation request for {out_name}")

        try:
            data = json.loads(req_path.read_text(encoding="utf-8"))
            payload = GenerationRequest.model_validate(data)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to read generation request for {out_name}: {exc}")

        spread_number = parse_spread_number(out_name, fallback=i + 1)
        slot_count = max(1, len(payload.slots) or 1)

        if getattr(payload, "auto_place", False):
            # Same placement code as the renderer, so rows match the printed spread.
            placed_people, logical_idx, _ = assign_logical_slots(
                people=payload.people,
                slots=payload.slots,
                placement_mode=payload.placement_mode,
                slot_assignments=payload.slot_assignments,
                force_alphabetical=payload.force_alphabetical,
            )
            placed = [(p, l + 1) for p, l in zip(placed_people, logical_idx)]
            if not placed:
                placed = [(p, i + 1) for i, p in enumerate(placed_people)]
        else:
            placed = []
            for idx, person in enumerate(p for p in payload.people if not p.excluded):
                raw_slot_number = int((payload.slot_assignments or {}).get(int(person.index), idx + 1))
                placed.append((person, raw_slot_number if 1 <= raw_slot_number <= slot_count else 1))

        for person, slot_number in placed:

            portrait_filename = person.mugshot_filename or payload.default_mugshot_filename or ""
            baby_filename = "" if person.hide_baby_photo else (person.baby_photo_filename or payload.default_baby_photo_filename or "")
            quote = "" if person.quote_blank else (person.quote or payload.default_quote or "")
            name = (f"{person.first_name} {person.last_name}").strip()

            rows.append(
                {
                    "Name": _safe_excel_text(name),
                    "Number": int(person.index),
                    "Baby Photo File Name": _safe_excel_text(baby_filename),
                    "Portrait Photo File Name": _safe_excel_text(portrait_filename),
                    "Quote": _safe_excel_text(quote),
                    "Spread Number": spread_number,
                    "Slot Number": slot_number,
                }
            )

    try:
        import pandas as pd

        df = pd.DataFrame(
            rows,
            columns=[
                "Name",
                "Number",
                "Baby Photo File Name",
                "Portrait Photo File Name",
                "Quote",
                "Spread Number",
                "Slot Number",
            ],
        )
        buf = io.BytesIO()
        # openpyxl is included in requirements; pandas will use it for .xlsx.
        df.to_excel(buf, index=False, sheet_name="Spreads")
        buf.seek(0)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to build spreadsheet: {exc}")

    filename = f"spread_data_{workspace_id}.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return StreamingResponse(buf, media_type=media_type, headers=headers)


@router.get("/status")
async def status(job_id: str, request: Request):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="This render job is no longer available. Check your results or start a new render.")
    enforce_workspace_read(request, str(job.get("workspace_id") or ""))
    return job
