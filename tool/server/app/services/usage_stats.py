from __future__ import annotations

import time
from typing import Any

from app.services import licensing_usage


def generations_per_day(*, days: int = 14) -> dict[str, list]:
    """Daily count of counted generation runs, oldest day first.

    Backed by `licensing_usage`'s persisted event log (see
    `routes/generation.py`'s `append_usage_event` call), so unlike the
    in-memory `metrics`/`system_stats` history this survives a restart.
    """

    events = licensing_usage.load_usage_events()
    now = time.time()
    day_seconds = 24 * 60 * 60

    buckets = [0] * days
    for ev in events:
        ts = float(ev.get("ts") or 0)
        age_days = int((now - ts) // day_seconds)
        idx = days - 1 - age_days
        if 0 <= idx < days:
            buckets[idx] += 1

    labels = [
        time.strftime("%b %d", time.localtime(now - (days - 1 - i) * day_seconds))
        for i in range(days)
    ]
    return {"labels": labels, "counts": buckets}


def usage_by_license_type(*, limit: int = 2000) -> dict[str, int]:
    events = licensing_usage.get_recent_usage(limit=limit)
    personal = sum(1 for ev in events if ev.get("license_type") == "personal")
    commercial = sum(1 for ev in events if ev.get("license_type") == "commercial")
    other = len(events) - personal - commercial
    return {"personal": personal, "commercial": commercial, "other": max(0, other)}


def top_license_keys(*, limit: int = 8, events_limit: int = 2000) -> list[dict[str, Any]]:
    """Most-active license keys by counted generation runs, most first."""

    events = licensing_usage.get_recent_usage(limit=events_limit)
    counts: dict[str, int] = {}
    last_seen: dict[str, float] = {}
    for ev in events:
        key = str(ev.get("key") or "")
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        ts = float(ev.get("ts") or 0)
        if ts > last_seen.get(key, 0):
            last_seen[key] = ts

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"key": key, "count": count, "last_used": last_seen.get(key)} for key, count in ranked]
