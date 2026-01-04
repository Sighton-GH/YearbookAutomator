from __future__ import annotations

import threading
import time
from typing import Optional


_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def start_job(job_id: str, workspace_id: str, *, kind: str, source_filename: str, mode: str, output_filename: str) -> None:
    now = time.time()
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "workspace_id": workspace_id,
            "kind": kind,
            "source_filename": source_filename,
            "mode": mode,
            "output_filename": output_filename,
            "progress": 0,
            "status": "running",
            "message": "Starting…",
            "error": None,
            "started_at": now,
            "updated_at": now,
            "completed_at": None,
            "already_removed": False,
            # Optional in-memory preview payload (used for non-destructive previews).
            "result_bytes": None,
        }


def update_job(
    job_id: str,
    *,
    progress: Optional[int] = None,
    status: Optional[str] = None,
    message: Optional[str] = None,
    error: Optional[str] = None,
    result_bytes: Optional[bytes] = None,
    already_removed: Optional[bool] = None,
) -> None:
    now = time.time()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if progress is not None:
            job["progress"] = max(0, min(100, int(progress)))
        if status is not None:
            job["status"] = status
            if status in {"done", "error"}:
                job["completed_at"] = now
        if message is not None:
            job["message"] = message
        if error is not None:
            job["error"] = error
            job["status"] = "error"
            job["completed_at"] = now
        if result_bytes is not None:
            job["result_bytes"] = result_bytes
        if already_removed is not None:
            job["already_removed"] = bool(already_removed)
        job["updated_at"] = now


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def pop_result_bytes(job_id: str) -> Optional[bytes]:
    """Return and clear the stored preview bytes for a completed job."""
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        b = job.get("result_bytes")
        job["result_bytes"] = None
        return b


def _eta_seconds_from_progress(started_at: float, progress: int) -> Optional[int]:
    if progress <= 0 or progress >= 100:
        return None
    elapsed = max(0.0, time.time() - started_at)
    remaining = elapsed * (100 - progress) / float(progress)
    # Clamp to something reasonable for UI.
    remaining = max(0.0, min(60 * 60.0, remaining))
    return int(round(remaining))


def to_status_payload(job: dict) -> dict:
    progress = int(job.get("progress") or 0)
    started_at = float(job.get("started_at") or time.time())
    return {
        "job_id": job.get("job_id"),
        "workspace_id": job.get("workspace_id"),
        "kind": job.get("kind"),
        "mode": job.get("mode"),
        "source_filename": job.get("source_filename"),
        "output_filename": job.get("output_filename"),
        "progress": progress,
        "status": job.get("status"),
        "message": job.get("message"),
        "error": job.get("error"),
        "already_removed": bool(job.get("already_removed") or False),
        "eta_seconds": _eta_seconds_from_progress(started_at, progress),
        "updated_at": job.get("updated_at"),
    }
