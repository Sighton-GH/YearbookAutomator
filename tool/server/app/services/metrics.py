from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Any, Deque


_START_TIME = time.time()
_LOCK = Lock()
_TOTAL_REQUESTS = 0
_STATUS_BUCKETS: dict[str, int] = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "other": 0}
# Rolling log of (timestamp, duration_ms, status). Bounded so memory stays flat.
_RECENT: Deque[tuple[float, float, int]] = deque(maxlen=4000)


def _bucket_for(status: int) -> str:
    if 200 <= status < 300:
        return "2xx"
    if 300 <= status < 400:
        return "3xx"
    if 400 <= status < 500:
        return "4xx"
    if 500 <= status < 600:
        return "5xx"
    return "other"


def record_request(*, status: int, duration_ms: float) -> None:
    global _TOTAL_REQUESTS
    now = time.time()
    with _LOCK:
        _TOTAL_REQUESTS += 1
        _STATUS_BUCKETS[_bucket_for(int(status))] += 1
        _RECENT.append((now, float(duration_ms), int(status)))


def _requests_since(now: float, seconds: float) -> list[tuple[float, float, int]]:
    cutoff = now - seconds
    return [r for r in _RECENT if r[0] >= cutoff]


def snapshot() -> dict[str, Any]:
    now = time.time()
    with _LOCK:
        total = _TOTAL_REQUESTS
        buckets = dict(_STATUS_BUCKETS)
        recent = list(_RECENT)

    last_minute = [r for r in recent if r[0] >= now - 60]
    last_5_min = [r for r in recent if r[0] >= now - 300]

    def avg_latency(rows: list[tuple[float, float, int]]) -> float:
        if not rows:
            return 0.0
        return round(sum(r[1] for r in rows) / len(rows), 1)

    return {
        "uptime_seconds": int(now - _START_TIME),
        "started_at": _START_TIME,
        "total_requests": total,
        "status_counts": buckets,
        "requests_last_minute": len(last_minute),
        "requests_last_5_minutes": len(last_5_min),
        "avg_latency_ms_last_minute": avg_latency(last_minute),
        "avg_latency_ms_last_5_minutes": avg_latency(last_5_min),
        "requests_per_minute": round(len(last_5_min) / 5.0, 1),
    }


def history_buckets(*, bucket_seconds: int = 60, num_buckets: int = 30) -> list[int]:
    """Request counts bucketed into fixed-width time windows, oldest first.

    Powers the Dashboard's request-volume chart. Backed by the same `_RECENT`
    rolling window as the rest of this module, so it's in-memory only and
    resets on restart (there's no persisted request history).
    """

    now = time.time()
    with _LOCK:
        recent = list(_RECENT)

    cutoff = now - (bucket_seconds * num_buckets)
    buckets = [0] * num_buckets
    for ts, _duration_ms, _status in recent:
        if ts < cutoff:
            continue
        age = now - ts
        idx = num_buckets - 1 - int(age // bucket_seconds)
        if 0 <= idx < num_buckets:
            buckets[idx] += 1
    return buckets


def reset() -> None:
    """Test helper: clears all recorded metrics."""

    global _TOTAL_REQUESTS
    with _LOCK:
        _TOTAL_REQUESTS = 0
        for k in _STATUS_BUCKETS:
            _STATUS_BUCKETS[k] = 0
        _RECENT.clear()
