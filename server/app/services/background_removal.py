from __future__ import annotations

import contextlib
import io
import os
import threading
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from PIL import Image

BackgroundMode = Literal["simple", "complex", "ultra_complex"]


class BackgroundAlreadyRemovedError(RuntimeError):
    """Raised when background removal is skipped due to existing alpha."""


_rembg_lock = threading.Lock()
_rembg_session = None


def _remove_background_ultra_complex(image_bytes: bytes) -> bytes:
    """High-quality ML background removal via rembg.

    This is intentionally heavier/slower than the OpenCV options.
    """

    try:
        from rembg import new_session, remove  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise ValueError(
            "Ultra complex background removal requires 'rembg'. "
            "Install server requirements to enable this mode."
        ) from exc

    global _rembg_session
    with _rembg_lock:
        if _rembg_session is None:
            # Good general-purpose model for photos.
            _rembg_session = new_session("isnet-general-use")

    # alpha_matting improves edges (hair, soft boundaries) but is slower.
    # NOTE: pymatting (used by rembg alpha-matting) prints PERFORMANCE WARNING
    # messages directly to stdout; suppress those by default to avoid spamming
    # the server logs.
    verbose = os.getenv("YMGA_REMBG_VERBOSE", "").strip().lower() in {"1", "true", "yes"}
    with _rembg_lock:
        if verbose:
            out = remove(
                image_bytes,
                session=_rembg_session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=10,
            )
        else:
            with contextlib.redirect_stdout(io.StringIO()):
                out = remove(
                    image_bytes,
                    session=_rembg_session,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=10,
                    alpha_matting_erode_size=10,
                )
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
    resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized, scale


def _soften_alpha(mask01: np.ndarray, sigma: float = 1.5) -> np.ndarray:
    mask255 = (mask01.astype(np.uint8) * 255)
    blurred = cv2.GaussianBlur(mask255, ksize=(0, 0), sigmaX=sigma, sigmaY=sigma)
    return blurred.astype(np.uint8)


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

    img_lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    dist = np.linalg.norm(img_lab - bg_lab[None, None, :], axis=2)

    # Dynamic-ish threshold based on border spread; keeps the simple method stable.
    spread = float(np.mean(np.std(border_lab.astype(np.float32), axis=0)))
    thr = 18.0 + min(20.0, spread * 0.5)

    bg = (dist < thr).astype(np.uint8)
    fg = (1 - bg).astype(np.uint8)

    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)

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
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
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
    sure_fg = cv2.erode(seed_fg, np.ones((k, k), np.uint8), iterations=1)
    gc[sure_fg == 1] = cv2.GC_FGD

    # Sure background = dilated background.
    seed_bg = (1 - seed_fg).astype(np.uint8)
    sure_bg = cv2.dilate(seed_bg, np.ones((k, k), np.uint8), iterations=1)
    gc[sure_bg == 1] = cv2.GC_BGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, gc, None, bgd_model, fgd_model, 6, cv2.GC_INIT_WITH_MASK)

    fg = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    fg = _keep_largest_component(fg)
    return fg


def remove_background(
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

    bgra = _decode_bgra(image_bytes)

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
                return _encode_png_rgba(rgba)

    bgr = bgra[:, :, :3]

    if mode == "ultra_complex":
        # rembg handles decoding/encoding; return PNG bytes with alpha.
        return _remove_background_ultra_complex(image_bytes)

    if mode == "complex":
        # GrabCut can be slow on large inputs; downscale for segmentation, then upscale the mask.
        bgr_small, scale = _resize_to_max(bgr, max_dim=900)
        # Seeded initialization improves quality vs rectangle-only.
        fg_small = _grabcut_foreground_mask_seeded(bgr_small)
        if scale != 1.0:
            h, w = bgr.shape[:2]
            fg01 = cv2.resize(fg_small, (w, h), interpolation=cv2.INTER_NEAREST).astype(np.uint8)
        else:
            fg01 = fg_small
    else:
        fg01 = _simple_background_mask(bgr)

    alpha = _soften_alpha(fg01, sigma=1.5)

    out_bgra = np.dstack([bgr, alpha])
    rgba = cv2.cvtColor(out_bgra, cv2.COLOR_BGRA2RGBA)
    return _encode_png_rgba(rgba)


def background_removed_filename(original_filename: str, person_index: int | None = None) -> str:
    stem = Path(original_filename).stem
    if person_index is None:
        return f"{stem}_nobg.png"
    return f"{stem}_nobg_{person_index}.png"
