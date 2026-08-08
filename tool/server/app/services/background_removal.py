from __future__ import annotations

import contextlib
import io
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
from PIL import Image

from app.services.admin_settings import get_face_detection_settings
from app.services import throttle

BackgroundMode = Literal["simple", "complex", "ultra_complex"]


class BackgroundAlreadyRemovedError(RuntimeError):
    """Raised when background removal is skipped due to existing alpha."""


class BackgroundCapacityError(RuntimeError):
    """Raised when all background-removal workers are busy."""


logger = logging.getLogger("uvicorn.error")

_rembg_pool_lock = threading.Lock()
_rembg_pool_condition = threading.Condition(_rembg_pool_lock)
_rembg_pool: list[object] = []
_rembg_pool_created = 0
_rembg_pool_max: int | None = None
_rembg_pool_providers: list[str] | None = None
_rembg_providers_logged = False

try:
    _background_worker_count = max(1, int(os.getenv("YMGA_MAX_CONCURRENT_BACKGROUND_OPS", "1") or "1"))
except ValueError:
    _background_worker_count = 1
_background_capacity = threading.BoundedSemaphore(_background_worker_count)

_opencl_configured = False
_opencl_enabled = False


def _configure_opencl() -> bool:
    """Best-effort OpenCL enablement for OpenCV ops."""
    global _opencl_configured, _opencl_enabled
    if _opencl_configured:
        return _opencl_enabled
    _opencl_configured = True
    prefer = os.getenv("YMGA_OPENCL", "true").strip().lower() not in {"0", "false", "no", "off"}
    if not prefer:
        _opencl_enabled = False
        return _opencl_enabled
    try:
        if cv2.ocl.haveOpenCL():
            cv2.ocl.setUseOpenCL(True)
            _opencl_enabled = bool(cv2.ocl.useOpenCL())
        else:
            _opencl_enabled = False
    except Exception:
        _opencl_enabled = False
    logger.info("OpenCL enabled: %s", _opencl_enabled)
    return _opencl_enabled


def _maybe_umat(arr: np.ndarray) -> cv2.UMat | np.ndarray:
    if _configure_opencl():
        try:
            return cv2.UMat(arr)
        except Exception:
            return arr
    return arr


def _maybe_umat_result(mat: cv2.UMat | np.ndarray) -> np.ndarray:
    if isinstance(mat, cv2.UMat):
        return mat.get()
    return mat


def _time_enabled() -> bool:
    return os.getenv("YMGA_BG_TIMING", "true").strip().lower() not in {"0", "false", "no", "off"}


def _get_rembg_providers() -> list[str] | None:
    """Return preferred ONNX Runtime providers (GPU if available), else None.

    We keep this best-effort so missing GPU runtimes don't break CPU usage.
    """

    if get_face_detection_settings().gpu_disabled:
        return ["CPUExecutionProvider"]

    try:
        import onnxruntime as ort  # type: ignore
    except Exception:
        return None

    available = set(ort.get_available_providers())

    forced = os.getenv("YMGA_REMBG_PROVIDER", "").strip()
    if forced:
        # Allow a comma-separated override (e.g. CUDAExecutionProvider,CPUExecutionProvider).
        wanted = [p.strip() for p in forced.split(",") if p.strip()]
        chosen = [p for p in wanted if p in available]
        if chosen:
            return chosen
    # Prefer GPU providers when installed.
    gpu_candidates = [
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "ROCMExecutionProvider",
        "TensorrtExecutionProvider",
    ]
    for gpu in gpu_candidates:
        if gpu in available:
            return [gpu, "CPUExecutionProvider"]

    if "CPUExecutionProvider" in available:
        return ["CPUExecutionProvider"]

    # Fallback: let rembg decide if providers are unknown.
    return None


def _get_rembg_pool_max(providers: list[str] | None) -> int:
    # Admin-configured GPU concurrency cap takes priority when set: it's the
    # live, user-facing control this dashboard exposes for rate limiting.
    configured = int(get_face_detection_settings().gpu_max_concurrent_ops or 0)
    if configured > 0:
        return configured

    raw = os.getenv("YMGA_REMBG_POOL_SIZE", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass

    # Default: auto-scale on Linux (up to 3 sessions); single session on Windows to
    # avoid DirectML resource contention. Override with YMGA_REMBG_POOL_SIZE.
    return min(os.cpu_count() or 1, 3)


def _acquire_rembg_session() -> object:
    """Acquire a rembg session from a small pool for parallel inference."""

    try:
        from rembg import new_session  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise ValueError(
            "Ultra complex background removal requires 'rembg'. "
            "Install server requirements to enable this mode."
        ) from exc

    global _rembg_pool_created, _rembg_pool_max, _rembg_pool_providers, _rembg_providers_logged

    with _rembg_pool_condition:
        if _rembg_pool_providers is None:
            _rembg_pool_providers = _get_rembg_providers()
        if not _rembg_providers_logged:
            logger.info("rembg providers: %s", _rembg_pool_providers or "default")
            _rembg_providers_logged = True
        if _rembg_pool_max is None:
            _rembg_pool_max = _get_rembg_pool_max(_rembg_pool_providers)

        while True:
            if _rembg_pool:
                return _rembg_pool.pop()

            if _rembg_pool_created < _rembg_pool_max:
                _rembg_pool_created += 1
                break

            # Wait for a session to be released.
            _rembg_pool_condition.wait()

    # Create session outside the lock.
    try:
        session = (
            new_session("isnet-general-use", providers=_rembg_pool_providers)
            if _rembg_pool_providers
            else new_session("isnet-general-use")
        )
    except Exception:
        with _rembg_pool_condition:
            _rembg_pool_created = max(0, _rembg_pool_created - 1)
            _rembg_pool_condition.notify()
        raise
    return session


def _release_rembg_session(session: object) -> None:
    with _rembg_pool_condition:
        _rembg_pool.append(session)
        _rembg_pool_condition.notify()


def get_rembg_pool_status() -> dict[str, Any]:
    """Read-only pool status for the admin dashboard."""

    with _rembg_pool_condition:
        return {
            "created": _rembg_pool_created,
            "max": _rembg_pool_max,
            "idle": len(_rembg_pool),
            "providers": list(_rembg_pool_providers) if _rembg_pool_providers else None,
        }


def _remove_background_ultra_complex(image_bytes: bytes) -> bytes:
    """High-quality ML background removal via rembg.

    This is intentionally heavier/slower than the OpenCV options.
    """

    try:
        from rembg import remove  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise ValueError(
            "Ultra complex background removal requires 'rembg'. "
            "Install server requirements to enable this mode."
        ) from exc

    session = _acquire_rembg_session()
    # Log active provider choice for easier GPU verification.
    providers = _rembg_pool_providers or _get_rembg_providers()
    logger.info("rembg active providers: %s", providers or "default")

    # alpha_matting improves edges (hair, soft boundaries) but is slower.
    # NOTE: pymatting (used by rembg alpha-matting) prints PERFORMANCE WARNING
    # messages directly to stdout; suppress those by default to avoid spamming
    # the server logs.
    verbose = os.getenv("YMGA_REMBG_VERBOSE", "").strip().lower() in {"1", "true", "yes"}
    started = time.monotonic()
    try:
        if verbose:
            out = remove(
                image_bytes,
                session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=10,
            )
        else:
            with contextlib.redirect_stdout(io.StringIO()):
                out = remove(
                    image_bytes,
                    session=session,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=10,
                    alpha_matting_erode_size=10,
                )
    finally:
        _release_rembg_session(session)
        throttle.gpu_pace(started)
    if not isinstance(out, (bytes, bytearray)):
        raise ValueError("Ultra complex background removal failed")
    return bytes(out)


def _decode_bgra(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Could not decode image")

    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    elif img.shape[2] == 4:
        pass
    else:
        raise ValueError("Unsupported image format")

    return img


def _encode_png_rgba(rgba: np.ndarray) -> bytes:
    pil = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return buf.getvalue()


def _binarize_alpha(bgra: np.ndarray, *, threshold: int = 128) -> np.ndarray:
    """Force alpha to fully transparent or fully opaque to avoid ghosting."""
    if bgra.shape[2] != 4:
        return bgra
    alpha = bgra[:, :, 3]
    alpha = np.where(alpha >= threshold, 255, 0).astype(np.uint8)
    out = bgra.copy()
    out[:, :, 3] = alpha
    return out


def _keep_largest_component(mask01: np.ndarray) -> np.ndarray:
    mask01 = (mask01 > 0).astype(np.uint8)
    num, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask01, connectivity=8)
    if num <= 1:
        return mask01
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == largest).astype(np.uint8)


def _resize_to_max(bgr: np.ndarray, max_dim: int) -> tuple[np.ndarray, float]:
    h, w = bgr.shape[:2]
    if max(h, w) <= max_dim:
        return bgr, 1.0
    scale = max_dim / float(max(h, w))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    src = _maybe_umat(bgr)
    resized = cv2.resize(src, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return _maybe_umat_result(resized), scale


def _soften_alpha(mask01: np.ndarray, sigma: float = 1.5) -> np.ndarray:
    mask255 = (mask01.astype(np.uint8) * 255)
    src = _maybe_umat(mask255)
    blurred = cv2.GaussianBlur(src, ksize=(0, 0), sigmaX=sigma, sigmaY=sigma)
    return _maybe_umat_result(blurred).astype(np.uint8)


def _simple_background_mask(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    if h < 8 or w < 8:
        return np.ones((h, w), dtype=np.uint8)

    # Sample border pixels to estimate the background colour.
    border = np.concatenate(
        [
            bgr[0, :, :],
            bgr[-1, :, :],
            bgr[:, 0, :],
            bgr[:, -1, :],
        ],
        axis=0,
    )

    border_lab = cv2.cvtColor(border.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3)
    bg_lab = np.median(border_lab, axis=0).astype(np.float32)

    img_lab = cv2.cvtColor(_maybe_umat(bgr), cv2.COLOR_BGR2LAB)
    img_lab = _maybe_umat_result(img_lab).astype(np.float32)
    dist = np.linalg.norm(img_lab - bg_lab[None, None, :], axis=2)

    # Dynamic-ish threshold based on border spread; keeps the simple method stable.
    spread = float(np.mean(np.std(border_lab.astype(np.float32), axis=0)))
    thr = 18.0 + min(20.0, spread * 0.5)

    bg = (dist < thr).astype(np.uint8)
    fg = (1 - bg).astype(np.uint8)

    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = _maybe_umat_result(fg)
    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    fg = _maybe_umat_result(fg)

    fg = _keep_largest_component(fg)
    return fg


def _grabcut_foreground_mask(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    if h < 8 or w < 8:
        return np.ones((h, w), dtype=np.uint8)

    margin_x = max(1, int(round(w * 0.05)))
    margin_y = max(1, int(round(h * 0.05)))
    rect = (margin_x, margin_y, max(1, w - 2 * margin_x), max(1, h - 2 * margin_y))

    mask = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    cv2.grabCut(bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)

    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = _maybe_umat_result(fg)
    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    fg = _maybe_umat_result(fg)
    fg = _keep_largest_component(fg)
    return fg


def _grabcut_foreground_mask_seeded(bgr: np.ndarray) -> np.ndarray:
    """GrabCut initialized from a heuristic foreground mask.

    This tends to be more stable than rectangle-only initialization, especially
    for off-center subjects and busy backgrounds.
    """

    h, w = bgr.shape[:2]
    if h < 8 or w < 8:
        return np.ones((h, w), dtype=np.uint8)

    # Start from the simple heuristic as a "probable foreground" seed.
    seed_fg = _simple_background_mask(bgr).astype(np.uint8)  # 1=fg,0=bg

    # Build a GrabCut mask.
    gc = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)

    # Mark borders as sure background.
    border = max(2, int(round(min(h, w) * 0.03)))
    gc[:border, :] = cv2.GC_BGD
    gc[-border:, :] = cv2.GC_BGD
    gc[:, :border] = cv2.GC_BGD
    gc[:, -border:] = cv2.GC_BGD

    # Probable foreground where seed says foreground.
    gc[seed_fg == 1] = cv2.GC_PR_FGD

    # Sure foreground = eroded seed (avoid including background near edges).
    k = max(3, int(round(min(h, w) * 0.01)) | 1)  # odd kernel size
    sure_fg = cv2.erode(_maybe_umat(seed_fg), np.ones((k, k), np.uint8), iterations=1)
    sure_fg = _maybe_umat_result(sure_fg)
    gc[sure_fg == 1] = cv2.GC_FGD

    # Sure background = dilated background.
    seed_bg = (1 - seed_fg).astype(np.uint8)
    sure_bg = cv2.dilate(_maybe_umat(seed_bg), np.ones((k, k), np.uint8), iterations=1)
    sure_bg = _maybe_umat_result(sure_bg)
    gc[sure_bg == 1] = cv2.GC_BGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, gc, None, bgd_model, fgd_model, 6, cv2.GC_INIT_WITH_MASK)

    fg = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = _maybe_umat_result(fg)
    fg = cv2.morphologyEx(_maybe_umat(fg), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    fg = _maybe_umat_result(fg)
    fg = _keep_largest_component(fg)
    return fg


def _remove_background_impl(
    image_bytes: bytes,
    mode: BackgroundMode = "simple",
    *,
    force: bool = False,
    report_already_removed: bool = False,
) -> bytes:
    """Return PNG bytes with alpha, keeping only the subject.

    - simple: fast heuristic for solid/simple backgrounds.
    - complex: GrabCut-based segmentation for complex backgrounds.
    - ultra_complex: ML segmentation (highest quality; heavy).
    """

    t0 = time.perf_counter()
    bgra = _decode_bgra(image_bytes)
    t_decode = time.perf_counter()

    # If the image already has transparency, it may already be background-removed.
    # However, some PNGs carry tiny accidental alpha (e.g. a few pixels) and users
    # still expect background removal to run. Only short-circuit when transparency
    # is substantial (unless forced).
    if bgra.shape[2] == 4 and not force:
        alpha = bgra[:, :, 3]
        if np.any(alpha < 255):
            # Treat pixels with alpha < 250 as "meaningfully transparent" (allows soft edges).
            transparent_fraction = float(np.mean(alpha < 250))
            if transparent_fraction >= 0.01:
                if report_already_removed:
                    raise BackgroundAlreadyRemovedError("background already removed")
                rgba = cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA)
                out = _encode_png_rgba(rgba)
                if _time_enabled():
                    logger.info("bg.remove timing: decode=%.1fms short-circuit=%.1fms", (t_decode - t0) * 1000, (time.perf_counter() - t0) * 1000)
                return out

    bgr = bgra[:, :, :3]

    if mode == "ultra_complex":
        # rembg handles decoding/encoding; return PNG bytes with alpha.
        t_ultra = time.perf_counter()
        ultra = _remove_background_ultra_complex(image_bytes)
        t_ultra_done = time.perf_counter()
        # Ensure final output is strictly transparent/opaque (no semi-transparent ghosting).
        out_bgra = _decode_bgra(ultra)
        out_bgra = _binarize_alpha(out_bgra, threshold=128)
        rgba = cv2.cvtColor(out_bgra, cv2.COLOR_BGRA2RGBA)
        out = _encode_png_rgba(rgba)
        if _time_enabled():
            logger.info(
                "bg.remove timing: decode=%.1fms ultra=%.1fms post=%.1fms total=%.1fms",
                (t_decode - t0) * 1000,
                (t_ultra_done - t_ultra) * 1000,
                (time.perf_counter() - t_ultra_done) * 1000,
                (time.perf_counter() - t0) * 1000,
            )
        return out

    if mode == "complex":
        # GrabCut can be slow on large inputs; downscale for segmentation, then upscale the mask.
        t_seg = time.perf_counter()
        bgr_small, scale = _resize_to_max(bgr, max_dim=900)
        # Seeded initialization improves quality vs rectangle-only.
        fg_small = _grabcut_foreground_mask_seeded(bgr_small)
        if scale != 1.0:
            h, w = bgr.shape[:2]
            fg01 = cv2.resize(_maybe_umat(fg_small), (w, h), interpolation=cv2.INTER_NEAREST)
            fg01 = _maybe_umat_result(fg01).astype(np.uint8)
        else:
            fg01 = fg_small
        t_seg_done = time.perf_counter()
    else:
        t_seg = time.perf_counter()
        fg01 = _simple_background_mask(bgr)
        t_seg_done = time.perf_counter()
    t_soft = time.perf_counter()
    alpha = _soften_alpha(fg01, sigma=1.5)
    out_bgra = np.dstack([bgr, alpha])
    t_out = time.perf_counter()
    rgba = cv2.cvtColor(out_bgra, cv2.COLOR_BGRA2RGBA)
    out = _encode_png_rgba(rgba)
    if _time_enabled():
        logger.info(
            "bg.remove timing: decode=%.1fms segment=%.1fms soften=%.1fms compose=%.1fms total=%.1fms",
            (t_decode - t0) * 1000,
            (t_seg_done - t_seg) * 1000,
            (t_out - t_soft) * 1000,
            (time.perf_counter() - t_out) * 1000,
            (time.perf_counter() - t0) * 1000,
        )
    return out


def remove_background(
    image_bytes: bytes,
    mode: BackgroundMode = "simple",
    *,
    force: bool = False,
    report_already_removed: bool = False,
) -> bytes:
    """Run one bounded background-removal operation."""
    try:
        wait_seconds = max(0.1, float(os.getenv("YMGA_BACKGROUND_CAPACITY_WAIT_SECONDS", "5") or "5"))
    except ValueError:
        wait_seconds = 5.0
    if not _background_capacity.acquire(timeout=wait_seconds):
        raise BackgroundCapacityError("Background-removal capacity is busy; retry shortly")
    try:
        return _remove_background_impl(
            image_bytes,
            mode=mode,
            force=force,
            report_already_removed=report_already_removed,
        )
    finally:
        _background_capacity.release()


def background_removed_filename(original_filename: str, person_index: int | None = None) -> str:
    stem = Path(original_filename).stem
    if person_index is None:
        return f"{stem}_nobg.png"
    return f"{stem}_nobg_{person_index}.png"
