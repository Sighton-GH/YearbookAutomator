"""Exact edited baby masks in clean-template coordinates."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import Box
from app.services.storage import workspace_dir
from app.services.template_parser import DEFAULT_BABY_HEX, _detect_boxes_with_color, _filled_mask

MAX_MASK_PIXELS = 40_000_000


def _check_size(box: Box) -> None:
    if box.width * box.height > MAX_MASK_PIXELS:
        raise ValueError("Baby cutout is too large. Please use a smaller box.")


def shape_mask(box: Box, shape: str) -> Image.Image:
    _check_size(box)
    if shape not in {"rectangle", "ellipse", "rounded"}:
        raise ValueError("Choose a rectangle, ellipse or rounded cutout.")
    mask = Image.new("L", (box.width, box.height), 0)
    draw = ImageDraw.Draw(mask)
    bounds = (0, 0, box.width - 1, box.height - 1)
    if shape == "ellipse":
        draw.ellipse(bounds, fill=255)
    elif shape == "rounded":
        draw.rounded_rectangle(bounds, radius=max(1, min(box.width, box.height) // 8), fill=255)
    else:
        draw.rectangle(bounds, fill=255)
    return mask


def regenerate_baby_mask(workspace_id: str, box: Box, shape: str = "auto") -> Path:
    _check_size(box)
    root = workspace_dir(workspace_id)
    masks_dir = root / "masks" / "baby"
    # Shape overrides have separate filenames: never poison auto's exact-mask lookup.
    key = f"{box.x}_{box.y}_{box.width}_{box.height}"
    if shape != "auto":
        mask = shape_mask(box, shape)
        path = masks_dir / f"{key}_{shape}.png"
    else:
        annotation = root / "uploads" / "template_annotated.png"
        clean = root / "template_clean.png"
        if not annotation.exists() or not clean.exists():
            raise FileNotFoundError("Upload annotated and clean templates before updating a baby cutout.")
        with Image.open(clean) as image:
            width, height = image.size
        if width * height > MAX_MASK_PIXELS:
            raise ValueError("Template is too large to update a baby cutout safely.")
        if box.x < 0 or box.y < 0 or box.x + box.width > width or box.y + box.height > height:
            raise ValueError("Keep the baby cutout inside the template.")
        settings_path = masks_dir / "detection.json"
        settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
        image = cv2.imdecode(np.frombuffer(annotation.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not read the annotated template. Please upload it again.")
        if image.shape[0] * image.shape[1] > MAX_MASK_PIXELS:
            raise ValueError("Annotated template is too large to update a baby cutout safely.")
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        _, blue = _detect_boxes_with_color(
            settings.get("color", DEFAULT_BABY_HEX), hsv,
            settings.get("min_area", 400), settings.get("tol_steps", [20, 24, 32, 40, 48]),
        )
        filled = _filled_mask(blue, settings.get("min_area", 400))
        if filled.shape != (height, width):
            filled = cv2.resize(filled, (width, height), interpolation=cv2.INTER_NEAREST)
        crop = filled[box.y:box.y + box.height, box.x:box.x + box.width]
        path = masks_dir / f"{key}.png"
        if not np.any(crop):
            # An edited box over no annotation must not reuse a stale exact mask.
            path.unlink(missing_ok=True)
            raise ValueError("No baby cutout was detected in this box. Choose a cutout shape or move it over a blue guide.")
        mask = Image.fromarray(crop, mode="L")
    masks_dir.mkdir(parents=True, exist_ok=True)
    mask.save(path, "PNG")
    return path
