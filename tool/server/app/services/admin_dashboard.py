from __future__ import annotations

import time
from typing import Any

from app.services import background_removal
from app.services import bandwidth
from app.services import licensing
from app.services import licensing_usage
from app.services import metrics
from app.services import system_stats
from app.services import usage_stats
from app.services import workspace_registry


def _license_summary() -> dict[str, Any]:
    records = licensing.list_licenses()
    now = int(time.time())
    total = len(records)
    revoked = sum(1 for r in records if r.revoked)
    expired = sum(1 for r in records if (not r.revoked) and r.expires_at is not None and int(r.expires_at) < now)
    active = max(0, total - revoked - expired)
    personal = sum(1 for r in records if r.license_type == "personal")
    commercial = sum(1 for r in records if r.license_type == "commercial")
    total_uses = sum(int(r.uses or 0) for r in records)
    return {
        "total": total,
        "active": active,
        "revoked": revoked,
        "expired": expired,
        "personal": personal,
        "commercial": commercial,
        "total_uses": total_uses,
    }


def _usage_summary() -> dict[str, Any]:
    events = licensing_usage.get_recent_usage(limit=2000)
    now = time.time()
    day_cutoff = now - 24 * 60 * 60
    month_bucket = time.strftime("%Y-%m", time.gmtime(now))

    today = 0
    this_month = 0
    for ev in events:
        ts = float(ev.get("ts") or 0)
        if ts >= day_cutoff:
            today += 1
        if time.strftime("%Y-%m", time.gmtime(ts)) == month_bucket:
            this_month += 1

    return {"uses_today": today, "uses_this_month": this_month, "total_recent_events": len(events)}


def get_dashboard_snapshot() -> dict[str, Any]:
    """Single composed snapshot powering the admin Dashboard + Sessions pages."""

    sessions = workspace_registry.list_all_sessions_detailed()
    active_sessions = [s for s in sessions if not s["is_stale"]]
    stale_sessions = [s for s in sessions if s["is_stale"]]

    return {
        "license_summary": _license_summary(),
        "usage_summary": _usage_summary(),
        "sessions": sessions,
        "active_sessions": active_sessions,
        "stale_sessions": stale_sessions,
        "active_session_count": len(active_sessions),
        "stale_session_count": len(stale_sessions),
        "active_locks": workspace_registry.active_locks(),
        "system": system_stats.get_system_stats(),
        "gpu": system_stats.get_gpu_stats(),
        "metrics": metrics.snapshot(),
        "bandwidth": bandwidth.snapshot(),
        "rembg_pool": background_removal.get_rembg_pool_status(),
        "disk_total_bytes": sum(int(s.get("disk_bytes") or 0) for s in sessions),
        "recent_audit": workspace_registry.recent_audit(limit=8),
    }


def get_usage_snapshot() -> dict[str, Any]:
    """Single composed snapshot powering the admin Usage page.

    Separate from `get_dashboard_snapshot()` (which stays focused on
    at-a-glance health) — this one is the deep-dive: request traffic, live
    resource trends, and tool/license usage broken down over time.
    """

    sessions = workspace_registry.list_all_sessions_detailed()

    return {
        "system": system_stats.get_system_stats(),
        "gpu": system_stats.get_gpu_stats(),
        "resource_history": system_stats.resource_history(),
        "metrics": metrics.snapshot(),
        "request_history": metrics.history_buckets(),
        "bandwidth": bandwidth.snapshot(),
        "rembg_pool": background_removal.get_rembg_pool_status(),
        "license_summary": _license_summary(),
        "usage_summary": _usage_summary(),
        "generations_per_day": usage_stats.generations_per_day(days=14),
        "usage_by_license_type": usage_stats.usage_by_license_type(),
        "top_license_keys": usage_stats.top_license_keys(limit=8),
        "disk_total_bytes": sum(int(s.get("disk_bytes") or 0) for s in sessions),
        "session_count": len(sessions),
        "active_session_count": sum(1 for s in sessions if not s["is_stale"]),
    }
