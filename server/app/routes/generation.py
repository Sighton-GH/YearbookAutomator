from __future__ import annotations

import io
import zipfile
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

from app.models.schemas import GenerationRequest
from app.services.licensing import (
    get_device_id_from_headers,
    get_required_license_key_from_headers,
    validate_and_record_use,
)
from app.services.licensing_usage import append_usage_event
from app.services.admin_settings import get_face_detection_settings
from app.services.generator import generate_composite
from app.services.storage import workspace_dir
from app.services.progress import start_job, update_job, get_job
from app.services.workspace_registry import ensure_workspace_write_access

router = APIRouter()


_SAFE_BASENAME_RE = re.compile(r"[^0-9A-Za-z._-]+")


_OUTPUT_EXTS = {".png", ".pdf", ".tif", ".tiff"}


def _list_output_files(root) -> list:
    # Prefer multi-spread outputs if present; otherwise fall back to a single output.<ext>.
    spread_files: list = []
    for ext in sorted(_OUTPUT_EXTS):
        spread_files.extend(sorted(root.glob(f"output_*.{ext.lstrip('.')}")))

    if not spread_files:
        for ext in sorted(_OUTPUT_EXTS):
            single = root / f"output{ext}"
            if single.exists():
                spread_files = [single]
                break

    return spread_files


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
    tmp.replace(path)


@router.post("/generate")
async def generate(payload: GenerationRequest, request: Request) -> dict[str, Any]:
    meta_from_guard = getattr(request.state, "license_meta", None) or {}
    license_type = "commercial" if str(meta_from_guard.get("license_type") or "") == "commercial" else "personal"
    access_ok, access_reason = ensure_workspace_write_access(
        workspace_id=payload.workspace_id,
        license_key=str(getattr(request.state, "license_key", "") or ""),
        license_type=license_type,
        device_id=getattr(request.state, "license_device_id", None),
        session_id=getattr(request.state, "client_session_id", None),
    )
    if not access_ok:
        status = 409 if access_reason in {"workspace_locked", "workspace_lock_expired", "workspace_not_checked_out"} else 403
        raise HTTPException(status_code=status, detail=access_reason or "workspace_write_not_allowed")

    feature_settings = get_face_detection_settings()
    if not feature_settings.enable_center_on_face_ops:
        payload.center_baby_on_face = False

    usage_payload: dict[str, object] | None = None
    if payload.count_usage:
        key = get_required_license_key_from_headers(request.headers)
        device_id = get_device_id_from_headers(request.headers)
        forwarded = request.headers.get("x-forwarded-for")
        ip = (forwarded.split(",")[0].strip() if forwarded else None) or (request.client.host if request.client else None)

        ok, meta = validate_and_record_use(key or "", ip=ip, device_id=device_id)
        if not ok:
            return JSONResponse(
                status_code=401,
                content={"detail": "License key required", "reason": meta.get("reason")},
            )

        append_usage_event(
            key=(key or "").strip().upper(),
            license_type=str(meta.get("license_type") or ""),
            ip=ip,
            device_id=device_id,
            route=str(request.url.path),
        )

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
    start_job(job_id, payload.workspace_id)

    # Save the exact request used for generation so the results page can export
    # the final resolved inputs (names, filenames, quotes, spread/slot numbers).
    try:
        _save_generation_request(payload)
    except Exception:
        # Non-fatal: rendering should still proceed even if persistence fails.
        pass

    def run_generation():
        try:
            out_path = generate_composite(payload, progress_cb=lambda pct, msg: update_job(job_id, progress=pct, status=msg))
            update_job(job_id, progress=100, status="done", output=out_path.name)
        except Exception as exc:  # pragma: no cover - defensive
            update_job(job_id, status="error", error=str(exc))

    Thread(target=run_generation, daemon=True).start()
    resp: dict[str, Any] = {"job_id": job_id}
    if usage_payload is not None:
        resp["usage"] = usage_payload
    return resp


@router.get("/download")
async def download(workspace_id: str, filename: str = "output.png"):
    path = workspace_dir(workspace_id) / filename
    if not path.exists():
        return {"error": "file not found"}
    return FileResponse(path)


@router.get("/outputs")
async def outputs(workspace_id: str) -> dict[str, Any]:
    root = workspace_dir(workspace_id)
    spread_files = _list_output_files(root)
    return {
        "workspace_id": workspace_id,
        "preview": _find_preview_file(root),
        "outputs": [p.name for p in spread_files],
    }


@router.get("/download-all")
async def download_all(workspace_id: str):
    root = workspace_dir(workspace_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="workspace not found")

    spread_files = _list_output_files(root)

    if not spread_files:
        raise HTTPException(status_code=404, detail="no rendered spreads found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in spread_files:
            # Store just the filename in the zip root.
            zf.write(p, arcname=p.name)
    buf.seek(0)

    headers = {"Content-Disposition": "attachment; filename=spreads.zip"}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.get("/download-spreadsheet")
async def download_spreadsheet(workspace_id: str):
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

        for idx, person in enumerate(payload.people):
            default_slot_number = idx + 1
            raw_slot_number = int((payload.slot_assignments or {}).get(int(person.index), default_slot_number))
            slot_number = raw_slot_number if 1 <= raw_slot_number <= slot_count else 1

            portrait_filename = person.mugshot_filename or payload.default_mugshot_filename or ""
            baby_filename = person.baby_photo_filename or payload.default_baby_photo_filename or ""
            quote = person.quote or payload.default_quote or ""
            name = (f"{person.first_name} {person.last_name}").strip()

            rows.append(
                {
                    "Name": name,
                    "Number": int(person.index),
                    "Baby Photo File Name": baby_filename,
                    "Portrait Photo File Name": portrait_filename,
                    "Quote": quote,
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
async def status(job_id: str):
    job = get_job(job_id)
    if not job:
        return {"error": "not found"}
    return job
