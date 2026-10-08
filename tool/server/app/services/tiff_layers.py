from __future__ import annotations

from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageOps

from app.models.schemas import GenerationRequest, TemplateSlots
from app.services.storage import InvalidWorkspacePath, safe_filename, workspace_dir, workspace_file


def _blank_rgba_like(base_rgb: Image.Image) -> Image.Image:
    return Image.new("RGBA", base_rgb.size, (0, 0, 0, 0))


def _as_rgba(img: Image.Image) -> Image.Image:
    return img.convert("RGBA") if img.mode != "RGBA" else img


def _paste_layer(
    layer: Image.Image,
    overlay: Image.Image,
    slot: TemplateSlots,
    kind: str,
    *,
    mask_shape: str | None = None,
    alpha_mask: Image.Image | None = None,
    focus_point: tuple[float, float] | None = None,
) -> None:
    # Local import to avoid circular imports with generator.py
    from app.services.generator import _fit_image, _fit_image_with_focus

    if kind == "mugshot":
        target = slot.mugshot
    else:
        target = slot.baby_photo

    if kind == "baby" and focus_point is not None:
        fitted = _fit_image_with_focus(overlay, target.width, target.height, focus_point[0], focus_point[1])
    else:
        fitted = _fit_image(overlay, target.width, target.height)

    fitted_rgba = _as_rgba(fitted)

    if kind == "baby" and alpha_mask is not None:
        layer.paste(fitted_rgba, (target.x, target.y), alpha_mask)
        return

    if kind == "baby" and mask_shape == "ellipse":
        mask = Image.new("L", (target.width, target.height), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.ellipse((0, 0, target.width - 1, target.height - 1), fill=255)
        layer.paste(fitted_rgba, (target.x, target.y), mask)
        return

    # Mugshots are rectangular; paste opaque.
    layer.paste(fitted_rgba, (target.x, target.y))


def _load_baby_mask(workspace_id: str, slot_box) -> Image.Image | None:
    # Local import to avoid circular imports with generator.py
    from app.services.generator import _load_baby_mask as _load

    return _load(workspace_id, slot_box)


def _detect_baby_slot_shape(template_ref: Image.Image, slot_box) -> str:
    # Local import to avoid circular imports with generator.py
    from app.services.generator import _detect_baby_slot_shape as _detect

    return _detect(template_ref, slot_box)


def _try_open_rgb(path: Path) -> Image.Image | None:
    try:
        with Image.open(path) as img:
            return ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        return None


def _try_open_baby_rgb(path: Path, baby_bg_rgb: tuple[int, int, int] | None) -> Image.Image | None:
    # Local import to avoid circular imports with generator.py
    from app.services.generator import _fill_transparency

    try:
        with Image.open(path) as img:
            upright = ImageOps.exif_transpose(img)
            if baby_bg_rgb is None:
                return upright.convert("RGB")
            return _fill_transparency(upright, baby_bg_rgb)
    except Exception:
        return None


def _detect_face_center(img_rgb: Image.Image) -> tuple[float, float] | None:
    # Local import to avoid circular imports with generator.py
    from app.services.generator import _detect_face_center as _detect

    return _detect(img_rgb)


def save_layered_tiff(payload: GenerationRequest, out_path: Path) -> Path:
    """Save a Photoshop-friendly editable TIFF.

    Implementation note:
    - Pillow does not write true Photoshop-layered TIFFs (embedded layer blocks).
    - We instead write a multi-page TIFF, where each page is a full-canvas RGBA
      image representing one layer. Photoshop can import multi-page TIFF pages,
      and users can stack them as layers.

    Pages (bottom -> top):
    1) composite (what you'd normally export as PNG)
    2) template background
    3) portraits
    4) baby photos
    5) names
    6) quotes
    """

    # Local imports from generator to reuse the exact same layout/text logic.
    from app.services.generator import (
        _load_font,
        _parse_hex_rgb,
        _render_wrapped_text,
        _wrap_text,
    )
    from app.services.placement import auto_place_slots_for_people

    root = workspace_dir(payload.workspace_id)
    template_path = root / "template_clean.png"
    if not template_path.exists():
        raise FileNotFoundError("Clean template not found; parse step must run first")

    template_rgb = Image.open(template_path).convert("RGB")
    template_ref = template_rgb.copy()

    background = _as_rgba(template_rgb)
    portraits_layer = _blank_rgba_like(template_rgb)
    baby_layer = _blank_rgba_like(template_rgb)
    names_layer = _blank_rgba_like(template_rgb)
    quotes_layer = _blank_rgba_like(template_rgb)

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

    allowed_image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

    baby_bg_rgb = _parse_hex_rgb(getattr(payload, "baby_background_color", None))
    center_baby_on_face = bool(getattr(payload, "center_baby_on_face", False))

    def _looks_like_image(path: Path) -> bool:
        return path.suffix.lower() in allowed_image_exts

    # --- Render per slot into independent layers ---
    for idx, (person, slot) in enumerate(zip(effective_people, effective_slots)):
        mugshot_filename = person.mugshot_filename or payload.default_mugshot_filename
        if mugshot_filename:
            try:
                mug_path = workspace_file(payload.workspace_id, "mugshots", safe_filename(mugshot_filename))
            except InvalidWorkspacePath:
                mug_path = root / "mugshots" / "__invalid__"
            if mug_path.exists() and _looks_like_image(mug_path):
                m_img = _try_open_rgb(mug_path)
                if m_img is not None:
                    _paste_layer(portraits_layer, m_img, slot, kind="mugshot")

        # Baby photo: try per-person first; if invalid/unreadable, fall back to default.
        candidate_baby = person.baby_photo_filename
        default_baby = payload.default_baby_photo_filename
        baby_to_try: list[str] = []
        if candidate_baby:
            baby_to_try.append(candidate_baby)
        if default_baby and default_baby not in baby_to_try:
            baby_to_try.append(default_baby)

        for baby_filename in baby_to_try:
            try:
                baby_path = workspace_file(payload.workspace_id, "baby", safe_filename(baby_filename))
            except InvalidWorkspacePath:
                continue
            if not baby_path.exists() or not _looks_like_image(baby_path):
                continue

            b_img = _try_open_baby_rgb(baby_path, baby_bg_rgb)
            if b_img is None:
                continue

            focus: tuple[float, float] | None = None
            if center_baby_on_face:
                if baby_filename not in baby_face_center_cache:
                    baby_face_center_cache[baby_filename] = _detect_face_center(b_img)
                focus = baby_face_center_cache[baby_filename]

            key = f"{slot.baby_photo.x}_{slot.baby_photo.y}_{slot.baby_photo.width}_{slot.baby_photo.height}"
            if key not in baby_mask_cache:
                baby_mask_cache[key] = _load_baby_mask(payload.workspace_id, slot.baby_photo)
            mask = baby_mask_cache[key]

            shape = baby_shape_cache.get(idx)
            if shape is None:
                shape = _detect_baby_slot_shape(template_ref, slot.baby_photo)
                baby_shape_cache[idx] = shape

            _paste_layer(baby_layer, b_img, slot, kind="baby", mask_shape=shape, alpha_mask=mask, focus_point=focus)
            break

        # Text layers: render into their own full-canvas RGBA images.
        name_text = f"{person.first_name} {person.last_name}".strip()
        if name_text:
            ndraw = ImageDraw.Draw(names_layer)
            content = name_text.upper() if name_all_caps else name_text
            ndraw.multiline_text((slot.name.x, slot.name.y), content, font=name_font, fill=(20, 30, 50, 255), align=name_align)

        quote = person.quote or payload.default_quote or ""
        if quote:
            qdraw = ImageDraw.Draw(quotes_layer)

            # Mirror generator.py wrapping behavior as closely as possible.
            max_quote_width = min(int(slot.quote.width), int(slot.mugshot.width * 1.5))
            # Ensure we don't render empty lines due to whitespace.
            quote_content = quote.upper() if quote_all_caps else quote
            # If quote is very short, keep a single draw call.
            if len(_wrap_text(qdraw, quote_content, _load_font(payload.workspace_id, quote_font_family, quote_font_weight, size=quote_font_size), max_width=max_quote_width)) <= 1:
                qdraw.multiline_text((slot.quote.x, slot.quote.y), quote_content, font=_load_font(payload.workspace_id, quote_font_family, quote_font_weight, size=quote_font_size), fill=(20, 30, 50, 255), align=quote_align)
            else:
                _render_wrapped_text(
                    draw=qdraw,
                    load_font=lambda s: _load_font(payload.workspace_id, quote_font_family, quote_font_weight, size=s),
                    text=quote_content,
                    box=slot.quote,
                    max_width=max_quote_width,
                    start_size=quote_font_size,
                    align=quote_align,
                    all_caps=False,  # already applied above
                    max_height=int(slot.mugshot.height),
                    spacing=0,
                )

    out_path = out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Save as multi-page TIFF.
    # Many viewers (and simple open flows in Photoshop) show only the first page,
    # so we include a fully composited first page to avoid "missing" content.
    composite = background.copy()
    composite = Image.alpha_composite(composite, portraits_layer)
    composite = Image.alpha_composite(composite, baby_layer)
    composite = Image.alpha_composite(composite, names_layer)
    composite = Image.alpha_composite(composite, quotes_layer)

    # Use DEFLATE compression to keep file sizes reasonable.
    pages = [composite, background, portraits_layer, baby_layer, names_layer, quotes_layer]
    pages[0].save(
        out_path,
        format="TIFF",
        save_all=True,
        append_images=pages[1:],
        compression="tiff_deflate",
    )

    return out_path
