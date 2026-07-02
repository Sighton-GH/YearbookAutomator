from __future__ import annotations

import os
import threading
import time

import pytest

from app.services import throttle
from app.services.admin_settings import FaceDetectionSettings


def _patch_settings(monkeypatch, **overrides):
    settings = FaceDetectionSettings(**overrides)
    monkeypatch.setattr(throttle, "get_face_detection_settings", lambda: settings)
    return settings


def _simulate_work(seconds: float) -> float:
    started = time.monotonic()
    time.sleep(seconds)
    return started


def test_cpu_pace_no_delay_at_full_speed(monkeypatch):
    _patch_settings(monkeypatch, cpu_throttle_percent=100)

    started = _simulate_work(0.03)
    before_pace = time.monotonic()
    throttle.cpu_pace(started)
    after_pace = time.monotonic()

    # No meaningful extra sleep should have been inserted.
    assert (after_pace - before_pace) < 0.05


def test_cpu_pace_throttles_proportionally(monkeypatch):
    _patch_settings(monkeypatch, cpu_throttle_percent=50)

    work_seconds = 0.06
    started = _simulate_work(work_seconds)
    total_start = started
    throttle.cpu_pace(started)
    total_elapsed = time.monotonic() - total_start

    # At 50%, work should represent ~half of total wall time, so total time
    # should be meaningfully more than the raw work duration (generous bounds
    # to avoid flakiness on slow/contended CI runners).
    assert total_elapsed >= work_seconds * 1.3
    assert total_elapsed < work_seconds * 6


def test_gpu_pace_uses_gpu_throttle_percent(monkeypatch):
    _patch_settings(monkeypatch, gpu_throttle_percent=50, cpu_throttle_percent=100)

    work_seconds = 0.05
    started = _simulate_work(work_seconds)
    total_start = started
    throttle.gpu_pace(started)
    total_elapsed = time.monotonic() - total_start

    assert total_elapsed >= work_seconds * 1.3


def test_apply_cpu_limits_sets_opencv_thread_cap(monkeypatch):
    _patch_settings(monkeypatch, cpu_max_threads=4, cpu_low_priority=False)

    calls: list[int] = []
    monkeypatch.setattr("cv2.setNumThreads", lambda n: calls.append(n))
    monkeypatch.setattr(throttle, "_apply_process_priority", lambda low_priority: None)

    monkeypatch.delenv("OMP_NUM_THREADS", raising=False)
    throttle.apply_cpu_limits()

    assert calls == [4]
    assert os.environ.get("OMP_NUM_THREADS") == "4"


def test_apply_cpu_limits_auto_clears_thread_cap(monkeypatch):
    _patch_settings(monkeypatch, cpu_max_threads=0, cpu_low_priority=False)

    calls: list[int] = []
    monkeypatch.setattr("cv2.setNumThreads", lambda n: calls.append(n))
    monkeypatch.setattr(throttle, "_apply_process_priority", lambda low_priority: None)

    monkeypatch.setenv("OMP_NUM_THREADS", "8")
    throttle.apply_cpu_limits()

    assert calls == [0]
    assert "OMP_NUM_THREADS" not in os.environ


def test_apply_cpu_limits_applies_process_priority(monkeypatch):
    _patch_settings(monkeypatch, cpu_max_threads=0, cpu_low_priority=True)
    monkeypatch.setattr("cv2.setNumThreads", lambda n: None)

    nice_calls: list[int] = []

    class FakeProcess:
        def nice(self, value):
            nice_calls.append(value)

    monkeypatch.setattr("psutil.Process", lambda: FakeProcess())

    throttle.apply_cpu_limits()

    expected = 10 if os.name != "nt" else __import__("psutil").BELOW_NORMAL_PRIORITY_CLASS
    assert nice_calls == [expected]


def test_apply_cpu_limits_process_priority_failure_is_swallowed(monkeypatch):
    """Best-effort: if psutil can't change priority (e.g. no permission), don't crash."""

    _patch_settings(monkeypatch, cpu_max_threads=0, cpu_low_priority=True)
    monkeypatch.setattr("cv2.setNumThreads", lambda n: None)

    def _boom():
        raise PermissionError("nope")

    monkeypatch.setattr("psutil.Process", _boom)

    throttle.apply_cpu_limits()  # should not raise


def test_gpu_concurrency_gate_limits_concurrent_access(monkeypatch):
    _patch_settings(monkeypatch, gpu_max_concurrent_ops=2)

    active = 0
    max_active = 0
    lock = threading.Lock()

    def worker():
        nonlocal active, max_active
        with throttle.gpu_concurrency_gate():
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.05)
            with lock:
                active -= 1

    threads = [threading.Thread(target=worker) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert max_active <= 2


def test_gpu_concurrency_gate_unlimited_when_zero(monkeypatch):
    _patch_settings(monkeypatch, gpu_max_concurrent_ops=0)

    entered = []

    def worker():
        with throttle.gpu_concurrency_gate():
            entered.append(True)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert len(entered) == 4


def test_onnx_session_options_none_without_thread_cap(monkeypatch):
    _patch_settings(monkeypatch, cpu_max_threads=0)
    assert throttle.onnx_session_options() is None


def test_onnx_session_options_sets_thread_counts(monkeypatch):
    pytest.importorskip("onnxruntime")
    _patch_settings(monkeypatch, cpu_max_threads=3)

    options = throttle.onnx_session_options()
    assert options is not None
    assert options.intra_op_num_threads == 3
    assert options.inter_op_num_threads == 3
