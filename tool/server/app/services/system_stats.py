from __future__ import annotations

import shutil
import subprocess
import time
from collections import deque
from threading import Event, Lock
from typing import Any, Deque

from app.services.storage import BASE_DATA

try:
    import psutil  # type: ignore

    _PSUTIL_AVAILABLE = True
except Exception:  # pragma: no cover - defensive; psutil is a pinned dependency
    psutil = None  # type: ignore
    _PSUTIL_AVAILABLE = False

_PROCESS = psutil.Process() if _PSUTIL_AVAILABLE else None


def get_system_stats() -> dict[str, Any]:
    """Best-effort CPU/memory/disk stats. Degrades gracefully without psutil."""

    out: dict[str, Any] = {
        "psutil_available": _PSUTIL_AVAILABLE,
        "cpu_percent": None,
        "cpu_count_logical": None,
        "cpu_count_physical": None,
        "load_average": None,
        "memory": None,
        "disk": None,
        "process": None,
    }
    if not _PSUTIL_AVAILABLE:
        return out

    try:
        out["cpu_percent"] = psutil.cpu_percent(interval=0.1)
        out["cpu_count_logical"] = psutil.cpu_count(logical=True)
        out["cpu_count_physical"] = psutil.cpu_count(logical=False)
    except Exception:
        pass

    try:
        out["load_average"] = [round(v, 2) for v in psutil.getloadavg()]
    except Exception:
        out["load_average"] = None

    try:
        vm = psutil.virtual_memory()
        out["memory"] = {
            "total_bytes": int(vm.total),
            "used_bytes": int(vm.total - vm.available),
            "percent": float(vm.percent),
        }
    except Exception:
        pass

    try:
        du = shutil.disk_usage(str(BASE_DATA))
        out["disk"] = {
            "total_bytes": int(du.total),
            "used_bytes": int(du.used),
            "free_bytes": int(du.free),
            "percent": round((du.used / du.total) * 100, 1) if du.total else 0.0,
        }
    except Exception:
        pass

    try:
        if _PROCESS is not None:
            with _PROCESS.oneshot():
                out["process"] = {
                    "rss_bytes": int(_PROCESS.memory_info().rss),
                    "cpu_percent": _PROCESS.cpu_percent(interval=None),
                    "num_threads": _PROCESS.num_threads(),
                    "create_time": _PROCESS.create_time(),
                }
    except Exception:
        pass

    return out


_NVIDIA_SMI_QUERY = "name,utilization.gpu,memory.used,memory.total,temperature.gpu"
_NVIDIA_SMI_CACHE: dict[str, Any] = {"ts": 0.0, "gpus": None}
_NVIDIA_SMI_CACHE_SECONDS = 2.0


def _query_nvidia_smi() -> list[dict[str, Any]] | None:
    now = time.monotonic()
    if _NVIDIA_SMI_CACHE["gpus"] is not None and (now - _NVIDIA_SMI_CACHE["ts"]) < _NVIDIA_SMI_CACHE_SECONDS:
        return _NVIDIA_SMI_CACHE["gpus"]

    if not shutil.which("nvidia-smi"):
        _NVIDIA_SMI_CACHE.update(ts=now, gpus=None)
        return None

    try:
        # Fixed argv list (no shell=True, no user input) to avoid command injection.
        result = subprocess.run(
            ["nvidia-smi", f"--query-gpu={_NVIDIA_SMI_QUERY}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            _NVIDIA_SMI_CACHE.update(ts=now, gpus=None)
            return None

        gpus: list[dict[str, Any]] = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) != 5:
                continue
            name, util, mem_used, mem_total, temp = parts
            try:
                gpus.append(
                    {
                        "name": name,
                        "utilization_percent": float(util),
                        "memory_used_mb": float(mem_used),
                        "memory_total_mb": float(mem_total),
                        "temperature_c": float(temp),
                    }
                )
            except ValueError:
                continue
        _NVIDIA_SMI_CACHE.update(ts=now, gpus=gpus)
        return gpus
    except Exception:
        _NVIDIA_SMI_CACHE.update(ts=now, gpus=None)
        return None


def get_gpu_stats() -> dict[str, Any]:
    """Best-effort GPU info: ONNX Runtime providers + nvidia-smi if present."""

    providers: list[str] = []
    try:
        import onnxruntime as ort  # type: ignore

        providers = list(ort.get_available_providers())
    except Exception:
        providers = []

    gpu_providers = [p for p in providers if p != "CPUExecutionProvider"]
    gpus = _query_nvidia_smi()

    return {
        "onnx_providers": providers,
        "gpu_providers_available": gpu_providers,
        "has_gpu_provider": bool(gpu_providers),
        "nvidia_smi_available": gpus is not None,
        "gpus": gpus or [],
    }


# ---------------------------------------------------------------------------
# Resource history sampler — periodically snapshots CPU/RAM/GPU utilization
# into a bounded in-memory series so the Usage page can chart a trend, not
# just a live point-in-time reading. Sampling (not per-request, unlike
# `metrics.py`) because there's no natural "event" to hang a CPU% reading on.
# ---------------------------------------------------------------------------

SAMPLE_INTERVAL_SECONDS = 15
_HISTORY_MAXLEN = 240  # 240 * 15s = 1 hour of retained samples
_HISTORY: Deque[dict[str, Any]] = deque(maxlen=_HISTORY_MAXLEN)
_HISTORY_LOCK = Lock()


def _sample_once() -> None:
    sys_stats = get_system_stats()
    gpu_stats = get_gpu_stats()
    gpus = gpu_stats.get("gpus") or []
    gpu_percent = round(sum(g["utilization_percent"] for g in gpus) / len(gpus), 1) if gpus else None

    sample = {
        "ts": time.time(),
        "cpu_percent": sys_stats.get("cpu_percent"),
        "memory_percent": (sys_stats.get("memory") or {}).get("percent"),
        "gpu_percent": gpu_percent,
    }
    with _HISTORY_LOCK:
        _HISTORY.append(sample)


def resource_history_loop(stop_event: Event) -> None:
    """Background thread entry point: sample resource usage every ~15s."""

    while not stop_event.is_set():
        try:
            _sample_once()
        except Exception:
            # Best-effort sampler; never crash the server over a bad reading.
            pass
        stop_event.wait(SAMPLE_INTERVAL_SECONDS)


def resource_history(*, window_seconds: int = 1800) -> dict[str, list]:
    """Recent (cpu_percent, memory_percent, gpu_percent) samples, oldest first.

    In-memory only, like `metrics.py`'s rolling window — resets on restart.
    """

    cutoff = time.time() - window_seconds
    with _HISTORY_LOCK:
        samples = [s for s in _HISTORY if s["ts"] >= cutoff]

    return {
        "timestamps": [s["ts"] for s in samples],
        "cpu_percent": [s["cpu_percent"] for s in samples],
        "memory_percent": [s["memory_percent"] for s in samples],
        "gpu_percent": [s["gpu_percent"] for s in samples],
        "window_seconds": window_seconds,
        "sample_interval_seconds": SAMPLE_INTERVAL_SECONDS,
    }


def reset_history() -> None:
    """Test helper: clears sampled history."""

    with _HISTORY_LOCK:
        _HISTORY.clear()
