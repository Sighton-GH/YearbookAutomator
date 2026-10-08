from __future__ import annotations

from typing import BinaryIO, List, Tuple

import json
import logging
import os

import cv2
import numpy as np

from app.models.schemas import Box, TemplateDetectionOptions, TemplateParseResponse, TemplateSlots
from app.services.storage import new_workspace_id, workspace_dir

DEFAULT_MUGSHOT_HEX = "00bf63"
DEFAULT_BABY_HEX = "004aad"
TEXT_NAME_HEX = "ff751f"  # orange
TEXT_QUOTE_HEX = "ff3131"  # red
MIN_AREA_FLOOR = 400  # safeguard against tiny detections

_opencl_configured = False
_opencl_enabled = False
_logger = logging.getLogger("uvicorn.error")


def _configure_opencl() -> bool:
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
    _logger.info("OpenCL enabled (template parser): %s", _opencl_enabled)
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


def _scale_box(box: Box, sx: float, sy: float) -> Box:
    return Box(
        x=int(round(box.x * sx)),
        y=int(round(box.y * sy)),
        width=max(1, int(round(box.width * sx))),
        height=max(1, int(round(box.height * sy))),
    )


def _maybe_decode_image_size(image_bytes: bytes) -> tuple[int, int]:
    np_data = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode template image")
    h, w, _ = img.shape
    return int(w), int(h)


def _hex_to_hsv_range(color_hex: str, tol: int = 32) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    """Convert hex colour to an HSV lower/upper range with tolerance.

    Accepts 6-digit (#RRGGBB) or 3-digit (#RGB) hex, trimming whitespace/# prefixes.
    """
    color_hex = color_hex.strip().lstrip("#")
    if len(color_hex) == 3:
        color_hex = "".join(ch * 2 for ch in color_hex)
    if len(color_hex) != 6:
        raise ValueError(f"Colour must be 6-digit hex, got '{color_hex}'")
    try:
        r = int(color_hex[0:2], 16)
        g = int(color_hex[2:4], 16)
        b = int(color_hex[4:6], 16)
    except ValueError:
        raise ValueError(f"Colour must be hex, got '{color_hex}'")
    bgr = np.uint8([[[b, g, r]]])
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
    lower = (int(max(0, hsv[0] - tol)), int(max(0, hsv[1] - tol * 2)), int(max(0, hsv[2] - tol * 2)))
    upper = (int(min(179, hsv[0] + tol)), int(min(255, hsv[1] + tol * 2)), int(min(255, hsv[2] + tol * 2)))
    return lower, upper


# Default HSV ranges derived from hex with modest tolerance
GREEN_RANGE = _hex_to_hsv_range(DEFAULT_MUGSHOT_HEX, tol=20)
BLUE_RANGE = _hex_to_hsv_range(DEFAULT_BABY_HEX, tol=20)


def _detect_boxes_with_color(hex_color: str, hsv_img: np.ndarray, min_area: int, tol_steps: list[int]) -> tuple[list[Box], np.ndarray]:
    """Try multiple tolerances for a custom colour until boxes are found."""
    last_mask = np.zeros(hsv_img.shape[:2], dtype=np.uint8)
    for tol in tol_steps:
        color_range = _hex_to_hsv_range(hex_color, tol=tol)
        mask = cv2.inRange(_maybe_umat(hsv_img), np.array(color_range[0]), np.array(color_range[1]))
        mask = _maybe_umat_result(mask)
        boxes = _boxes_from_mask(mask, min_area=min_area)
        last_mask = mask
        if boxes:
            return boxes, mask
    return [], last_mask


def _boxes_from_mask(mask: np.ndarray, min_area: int = 400) -> List[Box]:
    min_area = max(min_area, MIN_AREA_FLOOR)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: List[Box] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        boxes.append(Box(x=int(x), y=int(y), width=int(w), height=int(h)))
    boxes.sort(key=lambda b: (b.y, b.x))
    return boxes


def _filled_mask(mask: np.ndarray, min_area: int) -> np.ndarray:
    """Return a filled (solid) version of the mask.

    This turns outline-only annotations into filled shapes, which makes it usable as a paste mask
    for circles, rounded rectangles, triangles, etc.
    """
    min_area = max(min_area, MIN_AREA_FLOOR)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        cv2.drawContours(filled, [contour], contourIdx=-1, color=255, thickness=-1)

    # Close small gaps/holes so the mask pastes cleanly.
    kernel = np.ones((5, 5), np.uint8)
    filled = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, kernel)
    return filled


def _dedupe_boxes(boxes: List[Box], tolerance: int = 10) -> List[Box]:
    """Remove duplicate boxes that share exact or near-identical coordinates.
    
    Two boxes are considered duplicates if their x, y, width, and height 
    all differ by at most `tolerance` pixels.
    """
    if not boxes:
        return []
    unique: List[Box] = []
    for box in boxes:
        is_dup = False
        for existing in unique:
            if (
                abs(box.x - existing.x) <= tolerance
                and abs(box.y - existing.y) <= tolerance
                and abs(box.width - existing.width) <= tolerance
                and abs(box.height - existing.height) <= tolerance
            ):
                is_dup = True
                break
        if not is_dup:
            unique.append(box)
    return unique


def tolerance_steps(tolerance: int | None, defaults: list[int]) -> list[int]:
    """Omitted sensitivity preserves the legacy sweep, including custom colours."""
    validated = TemplateDetectionOptions(tolerance=tolerance).tolerance
    if validated is None:
        return defaults
    return sorted({min(64, validated + delta) for delta in (0, 8, 16, 24, 32)})


def extract_slots(
    annotated_png: BinaryIO,
    clean_template: BinaryIO | None = None,
    mugshot_hex: str | None = None,
    baby_hex: str | None = None,
    min_area: int = 400,
    name_hex: str | None = None,
    quote_hex: str | None = None,
    enable_baby_photos: bool = True,
    enable_quotes: bool = True,
    template_id: str | None = None,
    tolerance: int | None = None,
) -> TemplateParseResponse:
    annotated_bytes = annotated_png.read()
    np_data = np.frombuffer(annotated_bytes, np.uint8)
    img = cv2.imdecode(np_data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode annotated template")

    # If the clean template differs in pixel dimensions (common when users export annotated vs clean
    # spreads at different resolutions), scale all detected boxes/masks into the clean template's
    # pixel coordinate system so generation renders text at the expected size.
    clean_w: int | None = None
    clean_h: int | None = None
    sx = sy = 1.0
    if clean_template is not None:
        clean_bytes = clean_template.read()
        if not clean_bytes:
            raise ValueError("Clean template upload was empty")
        clean_w, clean_h = _maybe_decode_image_size(clean_bytes)

    height, width, _ = img.shape
    hsv = cv2.cvtColor(_maybe_umat(img), cv2.COLOR_BGR2HSV)
    hsv = _maybe_umat_result(hsv)

    if clean_w is not None and clean_h is not None and (clean_w != int(width) or clean_h != int(height)):
        sx = clean_w / float(width)
        sy = clean_h / float(height)

    mask_color = baby_hex or DEFAULT_BABY_HEX
    mask_steps = tolerance_steps(tolerance, [24, 32, 40, 48, 64] if baby_hex else [20, 24, 32, 40, 48])
    use_custom = bool(mugshot_hex or baby_hex)
    tol_steps = tolerance_steps(tolerance, [24, 32, 40, 48, 64])
    tol_default = tolerance_steps(tolerance, [20, 24, 32, 40, 48])

    if mugshot_hex:
        mugshot_boxes, green_mask = _detect_boxes_with_color(mugshot_hex, hsv, min_area, tol_steps)
    else:
        mugshot_boxes, green_mask = _detect_boxes_with_color(DEFAULT_MUGSHOT_HEX, hsv, min_area, tol_default)

    if enable_baby_photos:
        if baby_hex:
            baby_boxes, blue_mask = _detect_boxes_with_color(baby_hex, hsv, min_area, tol_steps)
        else:
            baby_boxes, blue_mask = _detect_boxes_with_color(DEFAULT_BABY_HEX, hsv, min_area, tol_default)
    else:
        baby_boxes = []
        blue_mask = np.zeros(hsv.shape[:2], dtype=np.uint8)

    filled_blue_mask = _filled_mask(blue_mask, min_area=min_area) if enable_baby_photos else np.zeros_like(blue_mask)

    # Fallback: if custom colours yielded nothing, retry with defaults to avoid hard failure.
    if use_custom and not mugshot_boxes and (not enable_baby_photos or not baby_boxes):
        green_range = GREEN_RANGE
        blue_range = BLUE_RANGE
        green_mask = cv2.inRange(_maybe_umat(hsv), np.array(green_range[0]), np.array(green_range[1]))
        green_mask = _maybe_umat_result(green_mask)
        mugshot_boxes = _boxes_from_mask(green_mask, min_area=min_area)
        if enable_baby_photos:
            blue_mask = cv2.inRange(_maybe_umat(hsv), np.array(blue_range[0]), np.array(blue_range[1]))
            blue_mask = _maybe_umat_result(blue_mask)
            baby_boxes = _boxes_from_mask(blue_mask, min_area=min_area)
            mask_color = DEFAULT_BABY_HEX
            mask_steps = [20]

    if not mugshot_boxes and (not enable_baby_photos or not baby_boxes):
        if enable_baby_photos:
            raise ValueError("No green or blue rectangles detected. Ensure the annotated template has coloured regions.")
        raise ValueError("No green rectangles detected. Ensure the annotated template has portrait regions.")

    name_hex = name_hex or TEXT_NAME_HEX
    quote_hex = quote_hex or TEXT_QUOTE_HEX
    name_boxes, _ = _detect_boxes_with_color(name_hex, hsv, min_area, tol_default)
    quote_boxes, _ = _detect_boxes_with_color(quote_hex, hsv, min_area, tol_default) if enable_quotes else ([], np.zeros(hsv.shape[:2], dtype=np.uint8))
    if not name_boxes:
        raise ValueError("No name (orange) rectangles detected. Ensure the annotated template has coloured regions for names.")
    if enable_quotes and not quote_boxes:
        raise ValueError("No quote (red) rectangles detected. Ensure the annotated template has coloured regions for quotes.")

    detected = {
        "mugshot": list(mugshot_boxes), "baby_photo": list(baby_boxes),
        "name": list(name_boxes), "quote": list(quote_boxes),
    }

    # Deduplicate boxes to remove elements with exact or near-identical coordinates
    mugshot_boxes = _dedupe_boxes(mugshot_boxes)
    baby_boxes = _dedupe_boxes(baby_boxes) if enable_baby_photos else []
    name_boxes = _dedupe_boxes(name_boxes)
    quote_boxes = _dedupe_boxes(quote_boxes) if enable_quotes else []

    # Primary element determines slot count - mugshots preferred, else baby photos.
    primary_boxes = mugshot_boxes if mugshot_boxes else (baby_boxes if enable_baby_photos else [])
    primary_count = len(primary_boxes)

    # Cross-list deduplication: if name and quote colours are similar, both may detect same boxes.
    # Remove quote boxes that are too similar to any name box (within tolerance).
    def boxes_match(a: Box, b: Box, tolerance: int = 15) -> bool:
        return (
            abs(a.x - b.x) <= tolerance
            and abs(a.y - b.y) <= tolerance
            and abs(a.width - b.width) <= tolerance
            and abs(a.height - b.height) <= tolerance
        )

    quote_boxes_filtered = [
        q for q in quote_boxes
        if not any(boxes_match(q, n) for n in name_boxes)
    ] if enable_quotes else []

    # If filtering removed all quotes, the colours are likely detecting identical boxes.
    # In this case, try to split by size: group boxes by height and separate into two groups.
    if enable_quotes and not quote_boxes_filtered and len(name_boxes) > primary_count:
        all_text_boxes = list(name_boxes)
        # Sort by height to find natural break point
        heights = sorted(set(b.height for b in all_text_boxes))
        if len(heights) >= 2:
            # Find the largest gap between consecutive heights
            max_gap = 0
            split_height = heights[len(heights) // 2]
            for i in range(len(heights) - 1):
                gap = heights[i + 1] - heights[i]
                if gap > max_gap:
                    max_gap = gap
                    split_height = (heights[i] + heights[i + 1]) / 2
            
            # Split: boxes with height <= split are names (short), height > split are quotes (tall)
            short_boxes = [b for b in all_text_boxes if b.height <= split_height]
            tall_boxes = [b for b in all_text_boxes if b.height > split_height]
            
            # Assign: typically names are short/wide, quotes could be either
            if len(short_boxes) >= primary_count and len(tall_boxes) >= primary_count:
                name_boxes = short_boxes
                quote_boxes_filtered = tall_boxes
            elif len(short_boxes) >= primary_count:
                name_boxes = short_boxes
                quote_boxes_filtered = tall_boxes if tall_boxes else short_boxes
            elif len(tall_boxes) >= primary_count:
                name_boxes = tall_boxes
                quote_boxes_filtered = short_boxes if short_boxes else tall_boxes

    quote_boxes = quote_boxes_filtered if quote_boxes_filtered else quote_boxes

    # Capture raw detections before grouping, deduplication or reclassification.
    raw_debug = {
        "mugshot_count": len(detected["mugshot"]),
        "baby_count": len(detected["baby_photo"]),
        "name_count": len(detected["name"]),
        "quote_count": len(detected["quote"]),
        "mugshots": detected["mugshot"], "baby_photos": detected["baby_photo"],
        "names": detected["name"], "quotes": detected["quote"],
    }
    invented: dict[str, list[Box]] = {kind: [] for kind in detected}

    def box_center(box: Box) -> tuple[float, float]:
        return (box.x + box.width / 2, box.y + box.height / 2)

    def distance(b1: Box, b2: Box) -> float:
        c1 = box_center(b1)
        c2 = box_center(b2)
        return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2) ** 0.5

    def find_nearest(anchor: Box, candidates: List[Box], used: set[int]) -> tuple[Box | None, int | None]:
        """Find the nearest unused candidate box to the anchor."""
        best_idx = None
        best_dist = float("inf")
        for i, cand in enumerate(candidates):
            if i in used:
                continue
            d = distance(anchor, cand)
            if d < best_dist:
                best_dist = d
                best_idx = i
        if best_idx is not None:
            return candidates[best_idx], best_idx
        return None, None

    # Sort primary boxes in reading order: top to bottom, left to right.
    # IMPORTANT: Use tolerance-based row clustering so minor y-offsets don't cause a whole
    # right column to be treated as an earlier "row" than the left column.
    def _reading_order(boxes: List[Box]) -> List[Box]:
        if not boxes:
            return []

        # Use median-ish height as a scale for row tolerance.
        heights = sorted(b.height for b in boxes)
        mid = heights[len(heights) // 2]
        row_tol = max(1, int(round(mid * 0.6)))

        items = [
            (b, b.y + b.height / 2.0, b.x + b.width / 2.0)
            for b in boxes
        ]
        items.sort(key=lambda t: (t[1], t[2]))

        rows: List[List[tuple[Box, float, float]]] = []
        row_centers: List[float] = []
        for b, cy, cx in items:
            if not rows:
                rows.append([(b, cy, cx)])
                row_centers.append(cy)
                continue
            if abs(cy - row_centers[-1]) <= row_tol:
                rows[-1].append((b, cy, cx))
                # update running centre (simple mean)
                row_centers[-1] = sum(t[1] for t in rows[-1]) / len(rows[-1])
            else:
                rows.append([(b, cy, cx)])
                row_centers.append(cy)

        ordered: List[Box] = []
        for row in rows:
            row.sort(key=lambda t: t[2])  # cx
            ordered.extend([t[0] for t in row])
        return ordered

    primary_boxes_sorted = _reading_order(primary_boxes)

    # Build slots by proximity matching: for each primary box in reading order, find nearest of each type
    used_baby: set[int] = set()
    used_name: set[int] = set()
    used_quote: set[int] = set()

    slots: List[TemplateSlots] = []
    for mug in primary_boxes_sorted:
        # Find nearest baby photo
        if enable_baby_photos:
            baby, baby_idx = find_nearest(mug, baby_boxes, used_baby)
            if baby_idx is not None:
                used_baby.add(baby_idx)
            if baby is None:
                baby = mug  # fallback
                invented["baby_photo"].append(baby)
        else:
            baby = mug

        # Find nearest name box
        name_box, name_idx = find_nearest(mug, name_boxes, used_name)
        if name_idx is not None:
            used_name.add(name_idx)
        if name_box is None:
            name_box = Box(x=mug.x, y=mug.y + mug.height + 6, width=mug.width, height=36)
            invented["name"].append(name_box)

        # Find nearest quote box
        if enable_quotes:
            quote_box, quote_idx = find_nearest(mug, quote_boxes, used_quote)
            if quote_idx is not None:
                used_quote.add(quote_idx)
            if quote_box is None:
                quote_box = Box(
                    x=name_box.x,
                    y=name_box.y + name_box.height + 4,
                    width=name_box.width,
                    height=max(48, name_box.height),
                )
                invented["quote"].append(quote_box)
        else:
            quote_box = name_box

        slots.append(TemplateSlots(mugshot=mug, baby_photo=baby, name=name_box, quote=quote_box))

    dropped: dict[str, list[Box]] = {}
    for kind, boxes in detected.items():
        remaining = [getattr(slot, kind) for slot in slots]
        dropped[kind] = []
        for box in boxes:
            if box in remaining:
                remaining.remove(box)
            else:
                dropped[kind].append(box)
    messages = []
    labels = {"mugshot": "portrait", "baby_photo": "baby photo", "name": "name", "quote": "quote"}
    for kind, label in labels.items():
        if dropped[kind]:
            n = len(dropped[kind])
            messages.append(f"{n} extra {label} {'box was' if n == 1 else 'boxes were'} ignored")
        if invented[kind]:
            n = len(invented[kind])
            messages.append(f"{n} {label} {'box was' if n == 1 else 'boxes were'} guessed - please check them")
    raw_debug.update(dropped=dropped, invented=invented, messages=messages)

    if not slots:
        raise ValueError("No slots could be generated from the annotated template.")

    template_id = template_id or new_workspace_id()

    # Scale slots (and debug boxes) into clean-template pixel space if needed.
    out_width = int(width)
    out_height = int(height)
    out_slots = slots
    out_filled_blue_mask = filled_blue_mask
    if clean_w is not None and clean_h is not None and (sx != 1.0 or sy != 1.0):
        out_width = int(clean_w)
        out_height = int(clean_h)
        out_slots = [
            TemplateSlots(
                mugshot=_scale_box(s.mugshot, sx, sy),
                baby_photo=_scale_box(s.baby_photo, sx, sy),
                name=_scale_box(s.name, sx, sy),
                quote=_scale_box(s.quote, sx, sy),
            )
            for s in slots
        ]

        # Resize the baby mask to the clean template's pixel space so we can crop the correct
        # per-slot alpha masks.
        out_filled_blue_mask = cv2.resize(
            filled_blue_mask,
            (out_width, out_height),
            interpolation=cv2.INTER_NEAREST,
        )

        if raw_debug is not None:
            raw_debug = {
                **raw_debug,
                "mugshots": [_scale_box(b, sx, sy) for b in raw_debug["mugshots"]],
                "baby_photos": [_scale_box(b, sx, sy) for b in raw_debug["baby_photos"]],
                "names": [_scale_box(b, sx, sy) for b in raw_debug["names"]],
                "quotes": [_scale_box(b, sx, sy) for b in raw_debug["quotes"]],
                "dropped": {k: [_scale_box(b, sx, sy) for b in v] for k, v in dropped.items()},
                "invented": {k: [_scale_box(b, sx, sy) for b in v] for k, v in invented.items()},
            }

    # Persist baby-photo masks for exact shape cropping (circle/rounded-rect/triangle/etc).
    # Filenames are keyed by the baby box coordinates so generation can find the correct mask
    # even when users remap slots.
    if enable_baby_photos:
        masks_dir = workspace_dir(template_id) / "masks" / "baby"
        # If re-parsing within an existing workspace, clear old masks so we don't
        # accumulate stale coordinate-keyed masks.
        if masks_dir.exists():
            for p in masks_dir.glob("*.png"):
                try:
                    p.unlink()
                except OSError:
                    pass
        masks_dir.mkdir(parents=True, exist_ok=True)
        (masks_dir / "detection.json").write_text(json.dumps({
            "color": mask_color, "tol_steps": mask_steps, "min_area": min_area,
        }), encoding="utf-8")
        for slot in out_slots:
            b = slot.baby_photo
            x0 = max(0, int(b.x))
            y0 = max(0, int(b.y))
            x1 = min(int(out_width), int(b.x + b.width))
            y1 = min(int(out_height), int(b.y + b.height))
            if x1 <= x0 or y1 <= y0:
                continue
            crop = out_filled_blue_mask[y0:y1, x0:x1]
            # Skip empty masks (e.g. when baby box was a fallback).
            if int(cv2.countNonZero(crop)) == 0:
                continue
            out_path = masks_dir / f"{x0}_{y0}_{x1 - x0}_{y1 - y0}.png"
            ok, buf = cv2.imencode(".png", crop)
            if ok:
                out_path.write_bytes(buf.tobytes())
    return TemplateParseResponse(
        template_id=template_id,
        width=int(out_width),
        height=int(out_height),
        slots=out_slots,
        raw_debug=raw_debug,
    )
