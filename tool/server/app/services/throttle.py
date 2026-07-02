from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from threading import Condition, Lock
from typing import Iterator

from app.services.admin_settings import get_face_detection_settings


logger = logging.getLogger("uvicorn.error")

_gpu_gate_lock = Lock()
_gpu_gate_condition = Condition(_gpu_gate_lock)
_gpu_gate_active = 0


def _pace(started_at: float, percent: int) -> None:
    """Sleep just enough that the calling thread's duty cycle matches `percent`.

    If work took `w` seconds and we want it to represent `percent`% of total wall
    time, total time should be `w * 100 / percent`, so we sleep the remainder:
    `w * (100 - percent) / percent`. At percent>=100 this is a no-op.
    """

    pct = max(1, min(100, int(percent)))
    if pct >= 100:
        return
    elapsed = time.monotonic() - started_at
    if elapsed <= 0:
        return
    sleep_for = elapsed * (100 - pct) / pct
    if sleep_for > 0:
        time.sleep(min(sleep_for, 5.0))


def cpu_pace(started_at: float) -> None:
    """Throttle CPU-bound work (called after each unit of work, e.g. per photo)."""

    settings = get_face_detection_settings()
    _pace(started_at, settings.cpu_throttle_percent)


def gpu_pace(started_at: float) -> None:
    """Throttle GPU-bound work (called after each inference call)."""

    settings = get_face_detection_settings()
    _pace(started_at, settings.gpu_throttle_percent)


def _apply_process_priority(low_priority: bool) -> None:
    """Best-effort OS scheduling priority control (via psutil, cross-platform).

    Note: on POSIX, raising priority back to normal after lowering it within
    the same process lifetime typically requires elevated permissions (CAP_SYS_
    NICE / root) — if that happens this silently no-ops and a restart is the
    reliable way to fully reset it.
    """

    try:
        import psutil  # type: ignore

        proc = psutil.Process()
        if os.name == "nt":
            target = psutil.BELOW_NORMAL_PRIORITY_CLASS if low_priority else psutil.NORMAL_PRIORITY_CLASS
        else:
            target = 10 if low_priority else 0
        proc.nice(target)
    except Exception:
        logger.debug("Could not apply process priority", exc_info=True)


def apply_cpu_limits() -> None:
    """Apply the configured CPU resource limits to the running process.

    Covers OpenCV/ONNX Runtime worker threads and OS scheduling priority. Safe
    to call repeatedly (e.g. at startup, per generation job, and whenever
    settings are saved). A `cpu_max_threads` of 0 means "auto" (OpenCV's
    default / all cores).
    """

    settings = get_face_detection_settings()
    max_threads = int(settings.cpu_max_threads or 0)

    try:
        import cv2  # type: ignore

        cv2.setNumThreads(max_threads if max_threads > 0 else 0)
    except Exception:
        logger.debug("Could not apply OpenCV thread limit", exc_info=True)

    # rembg's new_session() honors OMP_NUM_THREADS for its ONNX Runtime session
    # options (see rembg.session_factory.new_session). Setting it here caps
    # threads for any *new* sessions created after this call.
    if max_threads > 0:
        os.environ["OMP_NUM_THREADS"] = str(max_threads)
    else:
        os.environ.pop("OMP_NUM_THREADS", None)

    _apply_process_priority(bool(settings.cpu_low_priority))


def onnx_session_options(*, cpu_max_threads: int | None = None):
    """Build an onnxruntime SessionOptions honoring the configured thread cap.

    Returns None if onnxruntime is unavailable or no cap is configured.
    """

    max_threads = cpu_max_threads
    if max_threads is None:
        max_threads = int(get_face_detection_settings().cpu_max_threads or 0)
    if not max_threads or max_threads <= 0:
        return None

    try:
        import onnxruntime as ort  # type: ignore
    except Exception:
        return None

    options = ort.SessionOptions()
    options.intra_op_num_threads = int(max_threads)
    options.inter_op_num_threads = int(max_threads)
    return options


@contextmanager
def gpu_concurrency_gate() -> Iterator[None]:
    """Bound how many GPU-bound inference calls can run at once.

    No-op (unlimited) when `gpu_max_concurrent_ops` is 0.
    """

    global _gpu_gate_active

    limit = int(get_face_detection_settings().gpu_max_concurrent_ops or 0)
    if limit <= 0:
        yield
        return

    with _gpu_gate_condition:
        while _gpu_gate_active >= limit:
            _gpu_gate_condition.wait()
        _gpu_gate_active += 1
    try:
        yield
    finally:
        with _gpu_gate_condition:
            _gpu_gate_active -= 1
            _gpu_gate_condition.notify()


def gpu_gate_status() -> dict[str, int]:
    with _gpu_gate_condition:
        return {"active": _gpu_gate_active, "limit": int(get_face_detection_settings().gpu_max_concurrent_ops or 0)}
