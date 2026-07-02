from __future__ import annotations

import asyncio
import time
from typing import Any, Literal

from app.services.admin_settings import get_face_detection_settings


_SETTINGS_CACHE_SECONDS = 1.0
_MAX_BURST_SECONDS = 0.5

Kind = Literal["upload", "download"]


class RateBucket:
    """Async token bucket that throttles byte throughput to a target KB/s.

    The configured limit is re-read from admin settings periodically (rather
    than on every call) so large transfers don't hammer disk I/O checking for
    config changes, while still picking up admin changes within ~1s.
    """

    def __init__(self, kind: Kind):
        self._kind = kind
        self._lock = asyncio.Lock()
        self._tokens = 0.0
        self._last_refill = time.monotonic()
        self._cached_rate_bytes_per_sec: float = 0.0
        self._cache_ts = 0.0
        self._total_bytes = 0

    def _limit_bytes_per_sec(self) -> float:
        now = time.monotonic()
        if (now - self._cache_ts) > _SETTINGS_CACHE_SECONDS:
            settings = get_face_detection_settings()
            kbps = settings.network_upload_limit_kbps if self._kind == "upload" else settings.network_download_limit_kbps
            self._cached_rate_bytes_per_sec = 0.0 if kbps <= 0 else float(kbps) * 1024.0
            self._cache_ts = now
        return self._cached_rate_bytes_per_sec

    async def consume(self, num_bytes: int) -> None:
        if num_bytes <= 0:
            return
        self._total_bytes += num_bytes

        rate = self._limit_bytes_per_sec()
        if rate <= 0:
            return  # unlimited

        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._last_refill = now
            self._tokens = min(rate * _MAX_BURST_SECONDS, self._tokens + elapsed * rate)

            if self._tokens < num_bytes:
                deficit = num_bytes - self._tokens
                wait_seconds = deficit / rate
                self._tokens = 0.0
                await asyncio.sleep(wait_seconds)
                self._last_refill = time.monotonic()
            else:
                self._tokens -= num_bytes

    @property
    def total_bytes(self) -> int:
        return self._total_bytes


_upload_bucket = RateBucket("upload")
_download_bucket = RateBucket("download")


def get_upload_bucket() -> RateBucket:
    return _upload_bucket


def get_download_bucket() -> RateBucket:
    return _download_bucket


def snapshot() -> dict[str, Any]:
    settings = get_face_detection_settings()
    return {
        "upload_limit_kbps": int(settings.network_upload_limit_kbps or 0),
        "download_limit_kbps": int(settings.network_download_limit_kbps or 0),
        "total_bytes_uploaded": _upload_bucket.total_bytes,
        "total_bytes_downloaded": _download_bucket.total_bytes,
    }
