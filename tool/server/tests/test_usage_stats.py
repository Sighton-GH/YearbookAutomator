from __future__ import annotations

import time

from app.services import licensing_usage, usage_stats


def _isolate(monkeypatch, tmp_path):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))


def test_generations_per_day_buckets_by_calendar_day(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    now = time.time()
    day_seconds = 24 * 60 * 60
    events = [
        {"ts": now, "key": "YMGA1-A", "license_type": "personal", "ip": None, "device_id": "d1", "route": "/api/generation/generate"},
        {"ts": now, "key": "YMGA1-B", "license_type": "commercial", "ip": None, "device_id": "d2", "route": "/api/generation/generate"},
        {"ts": now - day_seconds, "key": "YMGA1-A", "license_type": "personal", "ip": None, "device_id": "d1", "route": "/api/generation/generate"},
    ]
    licensing_usage.save_usage_events(events)

    result = usage_stats.generations_per_day(days=7)
    assert len(result["labels"]) == 7
    assert len(result["counts"]) == 7
    assert result["counts"][-1] == 2  # today
    assert result["counts"][-2] == 1  # yesterday
    assert sum(result["counts"]) == 3


def test_usage_by_license_type_splits_correctly(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    licensing_usage.append_usage_event(key="YMGA1-A", license_type="personal", ip=None, device_id="d1", route="/api/generation/generate")
    licensing_usage.append_usage_event(key="YMGA1-B", license_type="commercial", ip=None, device_id="d2", route="/api/generation/generate")
    licensing_usage.append_usage_event(key="YMGA1-C", license_type="commercial", ip=None, device_id="d3", route="/api/generation/generate")

    result = usage_stats.usage_by_license_type()
    assert result == {"personal": 1, "commercial": 2, "other": 0}


def test_top_license_keys_ranks_by_count(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    licensing_usage.append_usage_event(key="YMGA1-FREQUENT", license_type="personal", ip=None, device_id="d1", route="/api/generation/generate")
    licensing_usage.append_usage_event(key="YMGA1-FREQUENT", license_type="personal", ip=None, device_id="d1", route="/api/generation/generate")
    licensing_usage.append_usage_event(key="YMGA1-RARE", license_type="personal", ip=None, device_id="d2", route="/api/generation/generate")

    top = usage_stats.top_license_keys(limit=5)
    assert top[0]["key"] == "YMGA1-FREQUENT"
    assert top[0]["count"] == 2
    assert top[1]["key"] == "YMGA1-RARE"
    assert top[1]["count"] == 1


def test_empty_usage_returns_empty_shapes(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    assert usage_stats.generations_per_day(days=5)["counts"] == [0, 0, 0, 0, 0]
    assert usage_stats.usage_by_license_type() == {"personal": 0, "commercial": 0, "other": 0}
    assert usage_stats.top_license_keys() == []
