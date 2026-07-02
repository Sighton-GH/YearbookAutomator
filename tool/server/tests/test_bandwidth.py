from __future__ import annotations

import asyncio
import time

from app.services.bandwidth import RateBucket
from app.services.admin_settings import FaceDetectionSettings


def _patch_bandwidth_settings(monkeypatch, module, **overrides):
    settings = FaceDetectionSettings(**overrides)
    monkeypatch.setattr(module, "get_face_detection_settings", lambda: settings)


def test_unlimited_bucket_does_not_delay(monkeypatch):
    import app.services.bandwidth as bandwidth_mod

    _patch_bandwidth_settings(monkeypatch, bandwidth_mod, network_upload_limit_kbps=0)
    bucket = RateBucket("upload")

    started = time.monotonic()
    asyncio.run(bucket.consume(50 * 1024 * 1024))  # 50 MB, would take a while if throttled
    elapsed = time.monotonic() - started

    assert elapsed < 0.5
    assert bucket.total_bytes == 50 * 1024 * 1024


def test_limited_bucket_throttles_proportionally(monkeypatch):
    import app.services.bandwidth as bandwidth_mod

    _patch_bandwidth_settings(monkeypatch, bandwidth_mod, network_upload_limit_kbps=10)  # 10 KB/s
    bucket = RateBucket("upload")

    async def run():
        # First chunk consumes the initial burst allowance near-instantly.
        await bucket.consume(1024)
        started = time.monotonic()
        # This second chunk exceeds the burst allowance and must be paced.
        await bucket.consume(10 * 1024)
        return time.monotonic() - started

    elapsed = asyncio.run(run())
    # At 10 KB/s, 10 KB should take roughly ~1s (allow generous bounds for CI).
    assert elapsed >= 0.5
    assert elapsed < 5.0


def test_download_bucket_is_independent_of_upload_bucket(monkeypatch):
    import app.services.bandwidth as bandwidth_mod

    settings = FaceDetectionSettings(network_upload_limit_kbps=1, network_download_limit_kbps=0)
    monkeypatch.setattr(bandwidth_mod, "get_face_detection_settings", lambda: settings)

    upload_bucket = RateBucket("upload")
    download_bucket = RateBucket("download")

    started = time.monotonic()
    asyncio.run(download_bucket.consume(5 * 1024 * 1024))
    elapsed = time.monotonic() - started

    # Download has no limit configured, so it should not be throttled even
    # though the upload bucket is heavily limited.
    assert elapsed < 0.5
    assert upload_bucket.total_bytes == 0


def test_consume_ignores_non_positive_byte_counts(monkeypatch):
    import app.services.bandwidth as bandwidth_mod

    _patch_bandwidth_settings(monkeypatch, bandwidth_mod, network_upload_limit_kbps=1)
    bucket = RateBucket("upload")

    asyncio.run(bucket.consume(0))
    asyncio.run(bucket.consume(-10))
    assert bucket.total_bytes == 0
