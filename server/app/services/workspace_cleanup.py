from __future__ import annotations

import os
import time
from dataclasses import dataclass
from threading import Event

from app.services import progress
from app.services.storage import delete_workspace, list_workspace_ids, read_workspace_meta


@dataclass(frozen=True)
class CleanupConfig:
    # If a client requests end-session, we wait a short grace period.
    grace_seconds: int = 20
    # Safety net: delete abandoned workspaces even without an explicit end-session.
    # Default now 8 hours from last_seen (session start/refresh) unless overridden by env.
    ttl_seconds: int = 8 * 60 * 60
    # How often the janitor loop runs.
    interval_seconds: int = 60
    # Treat jobs updated within this window as active.
    active_job_window_seconds: int = 5 * 60


def _config_from_env() -> CleanupConfig:
    def get_int(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or raw.strip() == "":
            return default
        try:
            return int(raw)
        except ValueError:
            return default

    return CleanupConfig(
        grace_seconds=get_int("YMGA_WORKSPACE_GRACE_SECONDS", 20),
        ttl_seconds=get_int("YMGA_WORKSPACE_TTL_SECONDS", 24 * 60 * 60),
        interval_seconds=get_int("YMGA_WORKSPACE_CLEANUP_INTERVAL_SECONDS", 60),
        active_job_window_seconds=get_int("YMGA_WORKSPACE_ACTIVE_JOB_WINDOW_SECONDS", 5 * 60),
    )


def _has_active_job(workspace_id: str, *, window_seconds: int) -> bool:
    now = time.time()
    for job in progress.list_jobs():
        if job.get("workspace_id") != workspace_id:
            continue
        status = str(job.get("status") or "")
        updated_at = float(job.get("updated_at") or 0)
        if status not in {"done", "error"} and (now - updated_at) <= window_seconds:
            return True
    return False


def run_cleanup_once(config: CleanupConfig | None = None) -> int:
    cfg = config or _config_from_env()
    now = time.time()
    deleted_count = 0

    for workspace_id in list_workspace_ids():
        if _has_active_job(workspace_id, window_seconds=cfg.active_job_window_seconds):
            continue

        meta = read_workspace_meta(workspace_id)
        last_seen = float(meta.get("last_seen") or 0)
        end_requested_at = meta.get("end_requested_at")

        should_delete = False
        if end_requested_at is not None:
            try:
                end_requested_at_f = float(end_requested_at)
            except (TypeError, ValueError):
                end_requested_at_f = 0.0
            if (now - end_requested_at_f) >= cfg.grace_seconds:
                should_delete = True
        elif last_seen and (now - last_seen) >= cfg.ttl_seconds:
            should_delete = True

        if should_delete and delete_workspace(workspace_id):
            deleted_count += 1

    return deleted_count


def cleanup_loop(stop_event: Event) -> None:
    cfg = _config_from_env()
    while not stop_event.is_set():
        try:
            run_cleanup_once(cfg)
        except Exception:
            # Best-effort janitor; never crash the server.
            pass
        stop_event.wait(cfg.interval_seconds)
