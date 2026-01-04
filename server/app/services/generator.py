from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from PIL import Image, ImageDraw, ImageFont
from PIL import UnidentifiedImageError

from app.models.schemas import GenerationRequest, TemplateSlots
from app.services.placement import auto_place_slots_for_people
from app.services.storage import workspace_dir


def _font_candidates(font_family: str) -> list[str]:
    # Accept either a single name/filename or a CSS font stack.
    # Examples from the UI: '"Georgia"' or 'Inter, system-ui, sans-serif'
    raw = (font_family or "").strip()
    if not raw:
        return []

    parts = [p.strip() for p in raw.split(",") if p.strip()]

    def strip_quotes(s: str) -> str:
        if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
            return s[1:-1].strip()
        return s

    candidates: list[str] = []
    seen: set[str] = set()
    for p in parts:
        p = strip_quotes(p)
        key = p.lower()
        if not p or key in seen:
            continue
        seen.add(key)
        candidates.append(p)
    return candidates


def _try_truetype(name_or_path: str, size: int) -> ImageFont.FreeTypeFont | None:
    try:
        return ImageFont.truetype(name_or_path, size=size)
    except OSError:
        return None


def _load_font(workspace_id: str, font_family: str, font_weight: str, size: int = 32) -> ImageFont.FreeTypeFont:
    # Prefer an uploaded font file (by filename) if present in the workspace.
    # Otherwise, try resolving a real TrueType font from the provided family/stack.
    fonts_dir = workspace_dir(workspace_id) / "fonts"
    candidates = _font_candidates(font_family)

    for cand in candidates:
        uploaded = fonts_dir / cand
        if uploaded.exists():
            loaded = _try_truetype(str(uploaded), size=size)
            if loaded is not None:
                return loaded

    for cand in candidates:
        loaded = _try_truetype(cand, size=size)
        if loaded is not None:
            return loaded

    # Robust fallbacks: common Windows fonts, then Pillow-bundled DejaVu.
    for fallback in [
        "segoeui.ttf",
        "arial.ttf",
        "calibri.ttf",
        "times.ttf",
        "DejaVuSans.ttf",
    ]:
        loaded = _try_truetype(fallback, size=size)
        if loaded is not None:
            return loaded

    # Last resort: Pillow's default bitmap font (may be very small).
    try:
        return ImageFont.load_default(size=size)  # type: ignore[call-arg]
    except TypeError:
        return ImageFont.load_default()


def _text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> float:
    # Pillow versions differ in best primitives; textbbox is the most reliable.
    bbox = draw.textbbox((0, 0), text, font=font)
    return float(bbox[2] - bbox[0])


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    max_width = max(1, int(max_width))
    content = (text or "").strip()
    if not content:
        return []

    words = content.split()
    lines: list[str] = []
    current: list[str] = []

    def flush():
        if current:
            lines.append(" ".join(current))
            current.clear()

    for word in words:
        # If adding the word stays within width, keep accumulating.
        trial = " ".join([*current, word]) if current else word
        if _text_width(draw, trial, font) <= max_width:
            current.append(word)
            continue

        # Start a new line.
        flush()

        # If the word itself is too wide, hard-break it.
        if _text_width(draw, word, font) > max_width:
            chunk = ""
            for ch in word:
                trial_chunk = chunk + ch
                if _text_width(draw, trial_chunk, font) <= max_width:
                    chunk = trial_chunk
                else:
                    if chunk:
                        lines.append(chunk)
                    chunk = ch
            if chunk:
                lines.append(chunk)
        else:
            current.append(word)

    flush()
    return lines


def _multiline_bbox(draw: ImageDraw.ImageDraw, xy: tuple[float, float], lines: list[str], font: ImageFont.ImageFont, align: str) -> tuple[int, int, int, int]:
    text = "\n".join(lines) if lines else ""
    return draw.multiline_textbbox(xy, text, font=font, align=align)


def _render_wrapped_text(
    *,
    draw: ImageDraw.ImageDraw,
    load_font: Callable[[int], ImageFont.ImageFont],
    text: str,
    box,
    max_width: int,
    start_size: int,
    align: str,
    all_caps: bool,
    min_size: int = 8,
    max_height: int | None = None,
    spacing: int = 0,
) -> None:
    content = (text.upper() if all_caps else text).strip()
    if not content:
        return

    max_width = max(1, int(max_width))
    allowed_height = int(max_height) if max_height is not None else int(box.height)
    allowed_height = max(1, allowed_height)

    # For centre alignment, treat x as the centre of the allowed width region.
    if align == "center":
        x = box.x + max_width / 2
        anchor = "ma"
    else:
        x = box.x
        anchor = "la"
    y = box.y

    for size in range(int(start_size), int(min_size) - 1, -1):
        font = load_font(size)
        lines = _wrap_text(draw, content, font, max_width=max_width)
        if not lines:
            return
        bbox = draw.multiline_textbbox((x, y), "\n".join(lines), font=font, align=align, spacing=spacing, anchor=anchor)
        height = bbox[3] - bbox[1]
        width = bbox[2] - bbox[0]
        if height <= allowed_height and width <= max_width:
            draw.multiline_text((x, y), "\n".join(lines), font=font, fill=(20, 30, 50), align=align, anchor=anchor, spacing=spacing)
            return

    # If we can't fit even at min_size, draw anyway (wrapped) at min_size.
    font = load_font(int(min_size))
    lines = _wrap_text(draw, content, font, max_width=max_width)
    if lines:
        draw.multiline_text((x, y), "\n".join(lines), font=font, fill=(20, 30, 50), align=align, anchor=anchor, spacing=spacing)


def _fit_image(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    if img.width == 0 or img.height == 0:
        return img
    scale = max(target_w / img.width, target_h / img.height)
    new_size = (int(img.width * scale), int(img.height * scale))
    resized = img.resize(new_size, Image.LANCZOS)
    x0 = (resized.width - target_w) // 2
    y0 = (resized.height - target_h) // 2
    return resized.crop((x0, y0, x0 + target_w, y0 + target_h))


def _fit_image_with_focus(img: Image.Image, target_w: int, target_h: int, focus_x: float, focus_y: float) -> Image.Image:
    """Scale-to-fill then crop so (focus_x, focus_y) ends up near the center.

    focus_x/focus_y are in *original image* pixel coordinates.
    """
    if img.width == 0 or img.height == 0:
        return img
    scale = max(target_w / img.width, target_h / img.height)
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)

    # Map focus point into resized coordinates.
    cx = float(focus_x) * scale
    cy = float(focus_y) * scale
    x0 = int(round(cx - target_w / 2))
    y0 = int(round(cy - target_h / 2))

    # Clamp crop box to image bounds.
    x0 = max(0, min(resized.width - target_w, x0))
    y0 = max(0, min(resized.height - target_h, y0))
    return resized.crop((x0, y0, x0 + target_w, y0 + target_h))


def _detect_face_center(img_rgb: Image.Image) -> tuple[float, float] | None:
    """Best-effort face detection. Returns the center of the largest detected face."""
    try:
        import numpy as np
        import cv2  # type: ignore
    except Exception:
        return None

    try:
        rgb = img_rgb.convert("RGB")
    except Exception:
        return None

    # Downscale for speed; map coordinates back to original.
    max_dim = max(rgb.width, rgb.height)
    scale = 1.0
    if max_dim > 900:
        scale = 900.0 / float(max_dim)
        new_size = (max(1, int(rgb.width * scale)), max(1, int(rgb.height * scale)))
        rgb_small = rgb.resize(new_size, Image.BILINEAR)
    else:
        rgb_small = rgb

    arr = np.array(rgb_small)
    if arr.ndim != 3 or arr.shape[2] != 3:
        return None

    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    try:
        gray = cv2.equalizeHist(gray)
    except Exception:
        pass

    cascade_paths = []
    try:
        base = getattr(cv2, "data", None)
        if base is not None and getattr(base, "haarcascades", None):
            cascade_paths = [
                str(base.haarcascades) + "haarcascade_frontalface_alt2.xml",
                str(base.haarcascades) + "haarcascade_frontalface_default.xml",
            ]
    except Exception:
        cascade_paths = []

    faces = []
    for path in cascade_paths:
        try:
            clf = cv2.CascadeClassifier(path)
            if clf.empty():
                continue
            found = clf.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            if found is not None and len(found) > 0:
                faces = found
                break
        except Exception:
            continue

    if faces is None or len(faces) == 0:
        return None

    # Choose the largest face.
    best = max(faces, key=lambda r: float(r[2]) * float(r[3]))
    x, y, w, h = [float(v) for v in best]
    cx_small = x + w / 2
    cy_small = y + h / 2

    # Map from small image coords back to original image coords.
    inv = 1.0 / scale
    return (cx_small * inv, cy_small * inv)


def _parse_hex_rgb(value: str | None) -> tuple[int, int, int] | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) == 3 and all(ch in "0123456789abcdefABCDEF" for ch in raw):
        raw = "".join([ch * 2 for ch in raw])
    if len(raw) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in raw):
        return None
    r = int(raw[0:2], 16)
    g = int(raw[2:4], 16)
    b = int(raw[4:6], 16)
    return (r, g, b)


def _fill_transparency(img: Image.Image, bg_rgb: tuple[int, int, int]) -> Image.Image:
    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    lo, hi = alpha.getextrema()
    if hi >= 255 and lo >= 255:
        # Fully opaque; no work needed.
        return rgba.convert("RGB")

    backdrop = Image.new("RGBA", rgba.size, bg_rgb + (255,))
    composed = Image.alpha_composite(backdrop, rgba)
    return composed.convert("RGB")


def _rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def _median_rgb(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    if not colors:
        return (255, 255, 255)
    rs = sorted(c[0] for c in colors)
    gs = sorted(c[1] for c in colors)
    bs = sorted(c[2] for c in colors)
    mid = len(colors) // 2
    return (rs[mid], gs[mid], bs[mid])


def _sample_points_in_rect(x0: int, y0: int, x1: int, y1: int, steps: int = 6) -> list[tuple[int, int]]:
    if x1 <= x0 or y1 <= y0:
        return []
    steps = max(2, steps)
    xs = [x0 + int((x1 - x0 - 1) * i / (steps - 1)) for i in range(steps)]
    ys = [y0 + int((y1 - y0 - 1) * i / (steps - 1)) for i in range(steps)]
    return [(x, y) for y in ys for x in xs]


def _get_pixel_safe(pix, x: int, y: int, w: int, h: int) -> tuple[int, int, int]:
    x = max(0, min(w - 1, x))
    y = max(0, min(h - 1, y))
    r, g, b = pix[x, y]
    return (int(r), int(g), int(b))


def _detect_baby_slot_shape(template_rgb: Image.Image, slot_box) -> str:
    """Heuristic: detect if the baby-photo slot is an oval cutout.

    Many templates have oval placeholders where the corners of the bounding box are background.
    We approximate background by sampling just outside the box and compare corner vs centre pixels.
    Returns: "ellipse" or "rect".
    """

    w, h = template_rgb.size
    pix = template_rgb.load()

    x0 = max(0, slot_box.x)
    y0 = max(0, slot_box.y)
    x1 = min(w, slot_box.x + slot_box.width)
    y1 = min(h, slot_box.y + slot_box.height)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return "rect"

    outside_samples: list[tuple[int, int, int]] = []
    # Sample a thin ring just outside the bounding box.
    ring = 2
    midx = (x0 + x1) // 2
    midy = (y0 + y1) // 2
    for dx in range(-slot_box.width // 3, slot_box.width // 3 + 1, max(1, slot_box.width // 10)):
        outside_samples.append(_get_pixel_safe(pix, midx + dx, y0 - ring, w, h))
        outside_samples.append(_get_pixel_safe(pix, midx + dx, y1 + ring, w, h))
    for dy in range(-slot_box.height // 3, slot_box.height // 3 + 1, max(1, slot_box.height // 10)):
        outside_samples.append(_get_pixel_safe(pix, x0 - ring, midy + dy, w, h))
        outside_samples.append(_get_pixel_safe(pix, x1 + ring, midy + dy, w, h))

    bg = _median_rgb(outside_samples)
    dist_thresh = 30.0

    corner_w = max(6, int((x1 - x0) * 0.12))
    corner_h = max(6, int((y1 - y0) * 0.12))
    center_w = max(6, int((x1 - x0) * 0.18))
    center_h = max(6, int((y1 - y0) * 0.18))

    corners = [
        (x0, y0, x0 + corner_w, y0 + corner_h),
        (x1 - corner_w, y0, x1, y0 + corner_h),
        (x0, y1 - corner_h, x0 + corner_w, y1),
        (x1 - corner_w, y1 - corner_h, x1, y1),
    ]
    center = (
        midx - center_w // 2,
        midy - center_h // 2,
        midx + center_w // 2,
        midy + center_h // 2,
    )

    def region_bg_ratio(rect) -> float:
        rx0, ry0, rx1, ry1 = rect
        rx0 = max(x0, rx0)
        ry0 = max(y0, ry0)
        rx1 = min(x1, rx1)
        ry1 = min(y1, ry1)
        pts = _sample_points_in_rect(rx0, ry0, rx1, ry1, steps=6)
        if not pts:
            return 0.0
        hit = 0
        for (pxx, pyy) in pts:
            if _rgb_distance(_get_pixel_safe(pix, pxx, pyy, w, h), bg) <= dist_thresh:
                hit += 1
        return hit / len(pts)

    corner_ratios = [region_bg_ratio(r) for r in corners]
    center_ratio = region_bg_ratio(center)
    avg_corner = sum(corner_ratios) / len(corner_ratios)

    # Oval cutout: corners look like background, centre looks non-background.
    if avg_corner >= 0.70 and center_ratio <= 0.35:
        return "ellipse"
    return "rect"


def _baby_mask_path(workspace_id: str, slot_box) -> Path:
    root = workspace_dir(workspace_id)
    masks_dir = root / "masks" / "baby"
    return masks_dir / f"{int(slot_box.x)}_{int(slot_box.y)}_{int(slot_box.width)}_{int(slot_box.height)}.png"


def _load_baby_mask(workspace_id: str, slot_box) -> Image.Image | None:
    path = _baby_mask_path(workspace_id, slot_box)
    if not path.exists():
        return None
    try:
        mask = Image.open(path).convert("L")
        # Ensure mask matches the target size exactly.
        if mask.size != (int(slot_box.width), int(slot_box.height)):
            mask = mask.resize((int(slot_box.width), int(slot_box.height)), Image.NEAREST)
        return mask
    except Exception:
        return None


def _paste_image(
    base: Image.Image,
    overlay: Image.Image,
    box: TemplateSlots,
    kind: str,
    mask_shape: str | None = None,
    alpha_mask: Image.Image | None = None,
    focus_point: tuple[float, float] | None = None,
) -> None:
    if kind == "mugshot":
        target = box.mugshot
    else:
        target = box.baby_photo
    if kind == "baby" and focus_point is not None:
        fitted = _fit_image_with_focus(overlay, target.width, target.height, focus_point[0], focus_point[1])
    else:
        fitted = _fit_image(overlay, target.width, target.height)
    if kind == "baby" and alpha_mask is not None:
        base.paste(fitted, (target.x, target.y), alpha_mask)
    elif kind == "baby" and mask_shape == "ellipse":
        mask = Image.new("L", (target.width, target.height), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.ellipse((0, 0, target.width - 1, target.height - 1), fill=255)
        base.paste(fitted, (target.x, target.y), mask)
    else:
        base.paste(fitted, (target.x, target.y))


def _render_text(draw: ImageDraw.ImageDraw, text: str, slot_box, font, align: str, all_caps: bool):
    content = text.upper() if all_caps else text
    draw.multiline_text((slot_box.x, slot_box.y), content, font=font, fill=(20, 30, 50), align=align)


def generate_composite(payload: GenerationRequest, progress_cb: Callable[[int, str], None] | None = None) -> Path:
    def tick(pct: int, msg: str):
        if progress_cb:
            progress_cb(pct, msg)

    root = workspace_dir(payload.workspace_id)
    template_path = root / "template_clean.png"
    if not template_path.exists():
        raise FileNotFoundError("Clean template not found; parse step must run first")

    tick(5, "Loading template")
    base = Image.open(template_path).convert("RGB")
    template_ref = base.copy()

    name_font_family = payload.name_font_family or payload.font_family
    name_font_weight = payload.name_font_weight or payload.font_weight
    name_font_size = int(payload.name_font_size or 40)
    name_align = payload.name_align or payload.align
    name_all_caps = payload.name_all_caps if payload.name_all_caps is not None else payload.all_caps

    quote_font_family = payload.quote_font_family or payload.font_family
    quote_font_weight = payload.quote_font_weight or payload.font_weight
    quote_font_size = int(payload.quote_font_size or 40)
    quote_align = payload.quote_align or payload.align
    quote_all_caps = payload.quote_all_caps if payload.quote_all_caps is not None else payload.all_caps

    name_font = _load_font(payload.workspace_id, name_font_family, name_font_weight, size=name_font_size)
    quote_font = _load_font(payload.workspace_id, quote_font_family, quote_font_weight, size=quote_font_size)
    draw = ImageDraw.Draw(base)

    baby_shape_cache: dict[int, str] = {}
    baby_mask_cache: dict[str, Image.Image | None] = {}
    baby_face_center_cache: dict[str, tuple[float, float] | None] = {}

    effective_people = payload.people
    effective_slots = payload.slots

    if getattr(payload, "auto_place", False):
        effective_people, effective_slots = auto_place_slots_for_people(
            people=payload.people,
            slots=payload.slots,
            placement_mode=getattr(payload, "placement_mode", "left_then_right"),
            slot_assignments=getattr(payload, "slot_assignments", None),
            force_alphabetical=getattr(payload, "force_alphabetical", False),
        )

    total = max(len(effective_people), 1)
    allowed_image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

    baby_bg_rgb = _parse_hex_rgb(getattr(payload, "baby_background_color", None))
    center_baby_on_face = bool(getattr(payload, "center_baby_on_face", False))

    def _looks_like_image(path: Path) -> bool:
        # Extension check is a fast guard, but we still rely on Pillow open errors as truth.
        return path.suffix.lower() in allowed_image_exts

    def _try_open_rgb(path: Path) -> Image.Image | None:
        try:
            with Image.open(path) as img:
                return img.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError):
            return None

    def _try_open_baby_rgb(path: Path) -> Image.Image | None:
        try:
            with Image.open(path) as img:
                if baby_bg_rgb is None:
                    # Preserve historical behavior: convert directly to RGB.
                    return img.convert("RGB")
                return _fill_transparency(img, baby_bg_rgb)
        except (UnidentifiedImageError, OSError, ValueError):
            return None

    for idx, (person, slot) in enumerate(zip(effective_people, effective_slots)):
        mugshot_filename = person.mugshot_filename or payload.default_mugshot_filename
        if mugshot_filename:
            mug_path = root / "mugshots" / mugshot_filename
            if mug_path.exists() and _looks_like_image(mug_path):
                m_img = _try_open_rgb(mug_path)
                if m_img is not None:
                    _paste_image(base, m_img, slot, kind="mugshot")

        # Baby photo: try per-person first; if invalid/unreadable, fall back to default.
        candidate_baby = person.baby_photo_filename
        default_baby = payload.default_baby_photo_filename
        baby_to_try: list[str] = []
        if candidate_baby:
            baby_to_try.append(candidate_baby)
        if default_baby and default_baby not in baby_to_try:
            baby_to_try.append(default_baby)

        for baby_filename in baby_to_try:
            baby_path = root / "baby" / baby_filename
            if not baby_path.exists():
                continue
            if not _looks_like_image(baby_path):
                continue
            b_img = _try_open_baby_rgb(baby_path)
            if b_img is None:
                continue

            focus: tuple[float, float] | None = None
            if center_baby_on_face:
                if baby_filename not in baby_face_center_cache:
                    baby_face_center_cache[baby_filename] = _detect_face_center(b_img)
                focus = baby_face_center_cache[baby_filename]

            # Prefer exact mask saved during template parsing (supports triangles/rounded-rectangles/circles).
            key = f"{slot.baby_photo.x}_{slot.baby_photo.y}_{slot.baby_photo.width}_{slot.baby_photo.height}"
            if key not in baby_mask_cache:
                baby_mask_cache[key] = _load_baby_mask(payload.workspace_id, slot.baby_photo)
            mask = baby_mask_cache[key]

            shape = baby_shape_cache.get(idx)
            if shape is None:
                shape = _detect_baby_slot_shape(template_ref, slot.baby_photo)
                baby_shape_cache[idx] = shape

            _paste_image(base, b_img, slot, kind="baby", mask_shape=shape, alpha_mask=mask, focus_point=focus)
            break

        quote = person.quote or payload.default_quote or ""
        _render_text(draw, f"{person.first_name} {person.last_name}", slot.name, name_font, name_align, name_all_caps)
        if quote:
            max_quote_width = min(int(slot.quote.width), int(slot.mugshot.width * 1.5))
            _render_wrapped_text(
                draw=draw,
                load_font=lambda s: _load_font(payload.workspace_id, quote_font_family, quote_font_weight, size=s),
                text=quote,
                box=slot.quote,
                max_width=max_quote_width,
                start_size=quote_font_size,
                align=quote_align,
                all_caps=quote_all_caps,
                # Allow the quote to use the full mugshot height before shrinking.
                max_height=int(slot.mugshot.height),
                # Pack lines tighter to maximize usable space; shrink only as a last resort.
                spacing=0,
            )

        pct = 10 + int((idx + 1) / total * 80)
        tick(pct, f"Rendered {idx + 1}/{total}")

    out_name = (payload.output_filename or "output.png").strip() or "output.png"
    out_path = root / out_name
    base.save(out_path)
    tick(100, "Done")
    return out_path
