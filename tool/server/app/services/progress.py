from __future__ import annotations

import os
import threading
import time
from typing import Optional

_progress: dict[str, dict] = {}
_lock = threading.Lock()
_active_workspaces: set[str] = set()


def _max_concurrent_generations() -> int:
    try:
        return max(1, int(os.getenv("YMGA_MAX_CONCURRENT_GENERATIONS", "2") or "2"))
    except ValueError:
        return 2


def try_reserve_generation(workspace_id: str) -> tuple[bool, str | None]:
    with _lock:
        if workspace_id in _active_workspaces:
            return False, "workspace_generation_in_progress"
        if len(_active_workspaces) >= _max_concurrent_generations():
            return False, "server_generation_capacity_reached"
        _active_workspaces.add(workspace_id)
        return True, None


def release_generation(workspace_id: str) -> None:
    with _lock:
        _active_workspaces.discard(workspace_id)


def start_job(job_id: str, workspace_id: str) -> None:
    with _lock:
        cutoff = time.time() - (24 * 60 * 60)
        stale = [key for key, value in _progress.items() if float(value.get("updated_at") or 0) < cutoff]
        for key in stale:
            _progress.pop(key, None)
        if len(_progress) >= 1_000:
            oldest = sorted(_progress, key=lambda key: float(_progress[key].get("updated_at") or 0))
            for key in oldest[: len(_progress) - 999]:
                _progress.pop(key, None)
        _progress[job_id] = {
            "workspace_id": workspace_id,
            "progress": 0,
            "status": "pending",
            "output": None,
            "error": None,
            "updated_at": time.time(),
            "cancel_requested": False,
            "warnings": [],
        }


class GenerationCancelled(Exception):
    pass


def request_cancel(job_id: str) -> bool:
    with _lock:
        job = _progress.get(job_id)
        if job is None:
            return False
        job["cancel_requested"] = True
        return True


def is_cancel_requested(job_id: str) -> bool:
    with _lock:
        job = _progress.get(job_id)
        return bool(job and job.get("cancel_requested"))


def raise_if_cancelled(job_id: str) -> None:
    if is_cancel_requested(job_id):
        raise GenerationCancelled()


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
        job = _progress.get(job_id)
        return dict(job) if job else None


def clear_job(job_id: str) -> None:
    with _lock:
        _progress.pop(job_id, None)


def list_jobs() -> list[dict]:
    with _lock:
        return list(_progress.values())


def append_warning(job_id: str, warning: str) -> None:
    with _lock:
        job = _progress.get(job_id)
        if job is not None and warning not in job["warnings"]:
            job["warnings"].append(warning)
