from __future__ import annotations

import os
import threading
import time
from typing import Optional


_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_active_workspaces: set[str] = set()


def _max_concurrent_jobs() -> int:
    try:
        return max(1, int(os.getenv("YMGA_MAX_CONCURRENT_BACKGROUND_JOBS", "2") or "2"))
    except ValueError:
        return 2


def try_reserve_job(workspace_id: str) -> tuple[bool, str | None]:
    with _lock:
        if workspace_id in _active_workspaces:
            return False, "workspace_image_job_in_progress"
        if len(_active_workspaces) >= _max_concurrent_jobs():
            return False, "server_image_job_capacity_reached"
        _active_workspaces.add(workspace_id)
        return True, None


def release_job(workspace_id: str) -> None:
    with _lock:
        _active_workspaces.discard(workspace_id)


def start_job(job_id: str, workspace_id: str, *, kind: str, source_filename: str, mode: str, output_filename: str) -> None:
    now = time.time()
    with _lock:
        cutoff = now - (24 * 60 * 60)
        stale = [key for key, value in _jobs.items() if float(value.get("updated_at") or 0) < cutoff]
        for key in stale:
            _jobs.pop(key, None)
        if len(_jobs) >= 1_000:
            oldest = sorted(_jobs, key=lambda key: float(_jobs[key].get("updated_at") or 0))
            for key in oldest[: len(_jobs) - 999]:
                _jobs.pop(key, None)
        for existing in _jobs.values():
            if existing.get("workspace_id") == workspace_id:
                existing["result_bytes"] = None
                existing["result_bytes_at"] = None
            stored_at = existing.get("result_bytes_at")
            if existing.get("result_bytes") is not None and stored_at is not None:
                try:
                    age = now - float(stored_at)
                except (TypeError, ValueError):
                    age = 0.0
                if age > 30 * 60:
                    existing["result_bytes"] = None
                    existing["result_bytes_at"] = None
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
            "cancel_requested": False,
            # Optional in-memory preview payload (used for non-destructive previews).
            "result_bytes": None,
            "result_bytes_at": None,
        }


class BackgroundJobCancelled(Exception):
    """Cancellation takes effect at the next processing-stage boundary."""


def request_cancel(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return False
        if job["status"] == "running":
            job["cancel_requested"] = True
        return True


def raise_if_cancelled(job_id: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        cancelled = bool(job and job.get("cancel_requested"))
    if cancelled:
        raise BackgroundJobCancelled()


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
            if status in {"done", "error", "cancelled"}:
                job["completed_at"] = now
        if message is not None:
            job["message"] = message
        if error is not None:
            job["error"] = error
            job["status"] = "error"
            job["completed_at"] = now
        if result_bytes is not None:
            job["result_bytes"] = result_bytes
            job["result_bytes_at"] = now
        if already_removed is not None:
            job["already_removed"] = bool(already_removed)
        job["updated_at"] = now


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None



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
