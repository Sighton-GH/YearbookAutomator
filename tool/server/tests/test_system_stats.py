from __future__ import annotations

from app.services import system_stats


def test_get_system_stats_shape():
    stats = system_stats.get_system_stats()
    assert stats["psutil_available"] is True
    assert isinstance(stats["cpu_percent"], (int, float))
    assert isinstance(stats["cpu_count_logical"], int)
    assert stats["memory"]["total_bytes"] > 0
    assert 0 <= stats["memory"]["percent"] <= 100
    assert stats["disk"]["total_bytes"] > 0
    assert stats["process"]["rss_bytes"] > 0


def test_get_gpu_stats_reports_onnx_providers():
    stats = system_stats.get_gpu_stats()
    assert isinstance(stats["onnx_providers"], list)
    assert "CPUExecutionProvider" in stats["onnx_providers"]
    assert isinstance(stats["has_gpu_provider"], bool)


def test_get_gpu_stats_degrades_gracefully_without_nvidia_smi(monkeypatch):
    monkeypatch.setattr(system_stats.shutil, "which", lambda name: None)
    # Bust the module-level cache so our patched `which` is actually consulted.
    system_stats._NVIDIA_SMI_CACHE.update(ts=0.0, gpus=None)

    stats = system_stats.get_gpu_stats()
    assert stats["nvidia_smi_available"] is False
    assert stats["gpus"] == []


def test_query_nvidia_smi_handles_nonzero_return_code(monkeypatch):
    class FakeResult:
        returncode = 1
        stdout = ""

    monkeypatch.setattr(system_stats.shutil, "which", lambda name: "/usr/bin/nvidia-smi")
    monkeypatch.setattr(system_stats.subprocess, "run", lambda *a, **k: FakeResult())
    system_stats._NVIDIA_SMI_CACHE.update(ts=0.0, gpus=None)

    stats = system_stats.get_gpu_stats()
    assert stats["nvidia_smi_available"] is False


def test_query_nvidia_smi_parses_csv_output(monkeypatch):
    class FakeResult:
        returncode = 0
        stdout = "NVIDIA Test GPU, 42, 512, 4096, 55\n"

    monkeypatch.setattr(system_stats.shutil, "which", lambda name: "/usr/bin/nvidia-smi")
    monkeypatch.setattr(system_stats.subprocess, "run", lambda *a, **k: FakeResult())
    system_stats._NVIDIA_SMI_CACHE.update(ts=0.0, gpus=None)

    stats = system_stats.get_gpu_stats()
    assert stats["nvidia_smi_available"] is True
    assert len(stats["gpus"]) == 1
    gpu = stats["gpus"][0]
    assert gpu["name"] == "NVIDIA Test GPU"
    assert gpu["utilization_percent"] == 42.0
    assert gpu["memory_used_mb"] == 512.0
    assert gpu["memory_total_mb"] == 4096.0
    assert gpu["temperature_c"] == 55.0


def test_resource_history_empty_before_any_sample():
    system_stats.reset_history()
    hist = system_stats.resource_history()
    assert hist["cpu_percent"] == []
    assert hist["memory_percent"] == []
    assert hist["gpu_percent"] == []


def test_sample_once_appends_a_reading():
    system_stats.reset_history()
    system_stats._sample_once()

    hist = system_stats.resource_history()
    assert len(hist["cpu_percent"]) == 1
    assert len(hist["memory_percent"]) == 1
    assert isinstance(hist["cpu_percent"][0], (int, float))
    assert isinstance(hist["memory_percent"][0], (int, float))


def test_resource_history_window_filters_old_samples():
    system_stats.reset_history()
    now = system_stats.time.time()
    with system_stats._HISTORY_LOCK:
        system_stats._HISTORY.append({"ts": now - 3600, "cpu_percent": 10.0, "memory_percent": 20.0, "gpu_percent": None})
        system_stats._HISTORY.append({"ts": now, "cpu_percent": 50.0, "memory_percent": 60.0, "gpu_percent": None})

    hist = system_stats.resource_history(window_seconds=60)
    assert hist["cpu_percent"] == [50.0]
