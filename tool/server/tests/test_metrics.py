from __future__ import annotations

import pytest

from app.services import metrics


def test_record_and_snapshot_counts_by_status_bucket():
    metrics.reset()

    metrics.record_request(status=200, duration_ms=10.0)
    metrics.record_request(status=201, duration_ms=20.0)
    metrics.record_request(status=404, duration_ms=5.0)
    metrics.record_request(status=500, duration_ms=30.0)

    snap = metrics.snapshot()
    assert snap["total_requests"] == 4
    assert snap["status_counts"]["2xx"] == 2
    assert snap["status_counts"]["4xx"] == 1
    assert snap["status_counts"]["5xx"] == 1
    assert snap["status_counts"]["3xx"] == 0
    assert snap["requests_last_minute"] == 4
    assert snap["avg_latency_ms_last_minute"] == pytest.approx(16.25, abs=0.1)


def test_snapshot_uptime_and_requests_per_minute():
    metrics.reset()
    for _ in range(10):
        metrics.record_request(status=200, duration_ms=1.0)

    snap = metrics.snapshot()
    assert snap["uptime_seconds"] >= 0
    assert snap["requests_last_5_minutes"] == 10
    assert snap["requests_per_minute"] == 2.0  # 10 requests / 5 minutes


def test_reset_clears_all_state():
    metrics.record_request(status=200, duration_ms=1.0)
    metrics.reset()
    snap = metrics.snapshot()
    assert snap["total_requests"] == 0
    assert all(v == 0 for v in snap["status_counts"].values())
    assert snap["requests_last_minute"] == 0


def test_unknown_status_code_falls_into_other_bucket():
    metrics.reset()
    metrics.record_request(status=101, duration_ms=1.0)
    snap = metrics.snapshot()
    assert snap["status_counts"]["other"] == 1


def test_history_buckets_counts_recent_requests_into_last_bucket():
    metrics.reset()
    for _ in range(5):
        metrics.record_request(status=200, duration_ms=1.0)

    buckets = metrics.history_buckets(bucket_seconds=60, num_buckets=10)
    assert len(buckets) == 10
    assert buckets[-1] == 5
    assert sum(buckets[:-1]) == 0


def test_history_buckets_empty_when_no_requests():
    metrics.reset()
    buckets = metrics.history_buckets(bucket_seconds=60, num_buckets=5)
    assert buckets == [0, 0, 0, 0, 0]
