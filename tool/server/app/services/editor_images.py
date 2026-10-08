"""Conservative cleanup of editor-owned files only, never original uploads."""
from __future__ import annotations

import time

from app.services import background_jobs
from app.services.storage import safe_filename, workspace_file, workspace_path

TEMP_PREFIX = "baby_preview_"
EDIT_PREFIX = "baby_edit_"


def cleanup_editor_images(workspace_id: str, candidates: list[str], protected: list[str]) -> int:
    keep = set(protected)
    # A cancelled worker still owns its input until its stage has finished.
    keep.update(job.get("source_filename") for job in background_jobs.list_jobs()
                if job.get("workspace_id") == workspace_id and job.get("status") == "running")
    deleted = 0
    for name in set(candidates) - keep:
        if not name.startswith((TEMP_PREFIX, EDIT_PREFIX)) or safe_filename(name) != name:
            continue
        path = workspace_file(workspace_id, "baby", name)
        try:
            if path.is_file():
                path.unlink()
                deleted += 1
        except OSError:
            pass  # Janitor or a later editor cleanup can retry.
    return deleted


def cleanup_stale_previews(workspace_id: str, *, now: float | None = None) -> int:
    cutoff = (time.time() if now is None else now) - 3600
    folder = workspace_path(workspace_id) / "baby"
    candidates = []
    if folder.is_dir():
        for path in folder.glob(f"{TEMP_PREFIX}*"):
            try:
                if path.is_file() and path.stat().st_mtime < cutoff:
                    candidates.append(path.name)
            except OSError:
                continue
    return cleanup_editor_images(workspace_id, candidates, [])
