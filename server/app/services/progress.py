from __future__ import annotations

import threading
import time
from typing import Optional

_progress: dict[str, dict] = {}
_lock = threading.Lock()


def start_job(job_id: str, workspace_id: str) -> None:
    with _lock:
        _progress[job_id] = {
            "workspace_id": workspace_id,
            "progress": 0,
            "status": "pending",
            "output": None,
            "error": None,
            "updated_at": time.time(),
        }


def update_job(job_id: str, *, progress: Optional[int] = None, status: Optional[str] = None, output: Optional[str] = None, error: Optional[str] = None) -> None:
    with _lock:
        if job_id not in _progress:
            return
        if progress is not None:
            _progress[job_id]["progress"] = max(0, min(100, int(progress)))
        if status is not None:
            _progress[job_id]["status"] = status
        if output is not None:
            _progress[job_id]["output"] = output
        if error is not None:
            _progress[job_id]["error"] = error
        _progress[job_id]["updated_at"] = time.time()


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        return _progress.get(job_id, None)


def clear_job(job_id: str) -> None:
    with _lock:
        _progress.pop(job_id, None)


def list_jobs() -> list[dict]:
    with _lock:
        return list(_progress.values())
