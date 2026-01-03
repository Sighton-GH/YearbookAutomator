from __future__ import annotations

import io
import zipfile
from threading import Thread
from uuid import uuid4

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse

from app.models.schemas import GenerationRequest
from app.services.generator import generate_composite
from app.services.storage import workspace_dir
from app.services.progress import start_job, update_job, get_job

router = APIRouter()


@router.post("/generate")
async def generate(payload: GenerationRequest) -> dict[str, str]:
    job_id = uuid4().hex
    start_job(job_id, payload.workspace_id)

    def run_generation():
        try:
            out_path = generate_composite(payload, progress_cb=lambda pct, msg: update_job(job_id, progress=pct, status=msg))
            update_job(job_id, progress=100, status="done", output=out_path.name)
        except Exception as exc:  # pragma: no cover - defensive
            update_job(job_id, status="error", error=str(exc))

    Thread(target=run_generation, daemon=True).start()
    return {"job_id": job_id}


@router.get("/download")
async def download(workspace_id: str, filename: str = "output.png"):
    path = workspace_dir(workspace_id) / filename
    if not path.exists():
        return {"error": "file not found"}
    return FileResponse(path)


@router.get("/download-all")
async def download_all(workspace_id: str):
    root = workspace_dir(workspace_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="workspace not found")

    # Prefer multi-spread outputs if present; otherwise fall back to single output.png.
    spread_files = sorted(root.glob("output_*.png"))
    if not spread_files:
        single = root / "output.png"
        if single.exists():
            spread_files = [single]

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


@router.get("/status")
async def status(job_id: str):
    job = get_job(job_id)
    if not job:
        return {"error": "not found"}
    return job
