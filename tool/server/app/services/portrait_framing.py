"""Portrait and auto-rectangle baby photo framing.

Defaults match the original cover crop. Focus wins over face-aware centring.
The generator supplies the shared detector's original-image face box and
forwards returned fallback warnings through the generation warning callback.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from PIL import Image, ImageChops, ImageDraw, ImageFilter

VALID_FITS = ("cover", "contain")
VALID_SHAPES = ("rect", "rounded", "ellipse")


def _hex_to_rgb(value: str | None, default: tuple[int, int, int]) -> tuple[int, int, int]:
    if not isinstance(value, str):
        return default
    s = value.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


@dataclass(frozen=True)
class PortraitFocus:
    x: float = 0.5
    y: float = 0.5
    zoom: float = 1.0

    @classmethod
    def coerce(cls, value: Any) -> "PortraitFocus | None":
        if value is None:
            return None
        if isinstance(value, PortraitFocus):
            return value
        if isinstance(value, Mapping):
            g = value.get
        else:
            g = lambda k, d=None: getattr(value, k, d)  # noqa: E731
        try:
            return cls(
                x=min(1.0, max(0.0, float(g("x", 0.5)))),
                y=min(1.0, max(0.0, float(g("y", 0.5)))),
                zoom=min(4.0, max(1.0, float(g("zoom", 1.0)))),
            )
        except (TypeError, ValueError):
            return None


@dataclass(frozen=True)
class PortraitShadow:
    color: tuple[int, int, int] = (0, 0, 0)
    opacity: float = 0.4
    offset_x: int = 4
    offset_y: int = 4
    blur: int = 6

    @classmethod
    def coerce(cls, value: Any) -> "PortraitShadow | None":
        if not value:
            return None
        if isinstance(value, PortraitShadow):
            return value
        g = value.get if isinstance(value, Mapping) else (lambda k, d=None: getattr(value, k, d))
        try:
            return cls(
                color=_hex_to_rgb(g("color", "#000000"), (0, 0, 0)),
                opacity=min(1.0, max(0.0, float(g("opacity", 0.4)))),
                offset_x=int(g("offset_x", 4)),
                offset_y=int(g("offset_y", 4)),
                blur=max(0, int(g("blur", 6))),
            )
        except (TypeError, ValueError):
            return None


@dataclass(frozen=True)
class PortraitStyle:
    fit: str = "cover"
    face_aware: bool = False
    shape: str = "rect"
    corner_radius: int = 0
    border_width: int = 0
    border_color: tuple[int, int, int] = (255, 255, 255)
    shadow: PortraitShadow | None = None
    contain_fill_color: tuple[int, int, int] = (255, 255, 255)

    @classmethod
    def from_request(cls, payload: Any) -> "PortraitStyle":
        def g(name: str, default: Any) -> Any:
            v = getattr(payload, name, None)
            return default if v is None else v

        fit = g("mugshot_fit", "cover")
        shape = g("mugshot_shape", "rect")
        return cls(
            fit=fit if fit in VALID_FITS else "cover",
            face_aware=bool(g("mugshot_face_aware", False)),
            shape=shape if shape in VALID_SHAPES else "rect",
            corner_radius=min(500, max(0, int(g("mugshot_corner_radius", 0)))),
            border_width=min(100, max(0, int(g("mugshot_border_width", 0)))),
            border_color=_hex_to_rgb(g("mugshot_border_color", "#ffffff"), (255, 255, 255)),
            shadow=PortraitShadow.coerce(getattr(payload, "mugshot_shadow", None)),
            contain_fill_color=_hex_to_rgb(g("contain_fill_color", "#ffffff"), (255, 255, 255)),
        )

    @property
    def is_default(self) -> bool:
        return self == PortraitStyle()


def _resize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Reuse the generator's resize (GPU path, Lanczos) so default output is identical.
    try:
        from app.services.generator import _resize_image

        return _resize_image(img, size)
    except Exception:
        return img if img.size == size else img.resize(size, Image.LANCZOS)


def compute_cover_crop(
    img_size: tuple[int, int],
    target: tuple[int, int],
    focus: PortraitFocus | None = None,
    face_box: tuple[float, float, float, float] | None = None,
    face_aware: bool = False,
) -> tuple[tuple[int, int], tuple[int, int]]:
    """Returns ``((new_w, new_h), (x0, y0))``: the scaled image size and the crop
    origin inside it. Priority: focus (with zoom) > face box (if face_aware) > centre.
    With no focus and no face the result equals ``generator._fit_image``.
    """
    iw, ih = img_size
    tw, th = target
    zoom = focus.zoom if focus else 1.0
    scale = max(tw / iw, th / ih) * zoom
    new_w = max(tw, int(iw * scale)) if zoom != 1.0 else int(iw * scale)
    new_h = max(th, int(ih * scale)) if zoom != 1.0 else int(ih * scale)
    if focus is not None:
        cx, cy = focus.x * new_w, focus.y * new_h
    elif face_aware and face_box is not None:
        fx0, fy0, fx1, fy1 = face_box
        cx, cy = ((fx0 + fx1) / 2) * (new_w / iw), ((fy0 + fy1) / 2) * (new_h / ih)
    else:
        return (new_w, new_h), ((new_w - tw) // 2, (new_h - th) // 2)
    x0 = int(round(cx - tw / 2))
    y0 = int(round(cy - th / 2))
    x0 = max(0, min(new_w - tw, x0))
    y0 = max(0, min(new_h - th, y0))
    return (new_w, new_h), (x0, y0)


def fit_portrait(
    img: Image.Image,
    width: int,
    height: int,
    style: PortraitStyle,
    focus: PortraitFocus | None = None,
    face_box: tuple[float, float, float, float] | None = None,
) -> Image.Image:
    """Return an RGB image exactly ``width`` x ``height``."""
    if img.width == 0 or img.height == 0 or width <= 0 or height <= 0:
        return img
    if style.fit == "contain":
        scale = min(width / img.width, height / img.height)
        nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
        resized = _resize(img.convert("RGB"), (nw, nh))
        canvas = Image.new("RGB", (width, height), style.contain_fill_color)
        canvas.paste(resized, ((width - nw) // 2, (height - nh) // 2))
        return canvas
    (nw, nh), (x0, y0) = compute_cover_crop(img.size, (width, height), focus, face_box, style.face_aware)
    resized = _resize(img, (nw, nh))
    return resized.crop((x0, y0, x0 + width, y0 + height))


def build_shape_mask(width: int, height: int, shape: str, corner_radius: int = 0) -> Image.Image | None:
    """"L" mask 255 inside the shape; ``None`` for a plain rectangle (no mask needed).

    Drawn at 4x and downsampled for smooth edges. Radius is clamped to half the
    shorter side. An ``ellipse`` ignores the radius.
    """
    if shape == "ellipse":
        kind = "ellipse"
    elif shape == "rounded" and corner_radius > 0:
        kind = "rounded"
    else:
        return None
    ss = 4
    big = Image.new("L", (width * ss, height * ss), 0)
    d = ImageDraw.Draw(big)
    box = (0, 0, width * ss - 1, height * ss - 1)
    if kind == "ellipse":
        d.ellipse(box, fill=255)
    else:
        r = min(corner_radius, width // 2, height // 2) * ss
        d.rounded_rectangle(box, radius=r, fill=255)
    return big.resize((width, height), Image.LANCZOS)


def build_border(mask: Image.Image | None, width: int, height: int, border_width: int,
                 shape: str, corner_radius: int) -> Image.Image | None:
    """"L" ring mask drawn INSIDE the box edge, ``border_width`` px thick."""
    bw = min(border_width, min(width, height) // 2)
    if bw <= 0:
        return None
    outer = mask if mask is not None else Image.new("L", (width, height), 255)
    iw, ih = width - 2 * bw, height - 2 * bw
    inner_small = build_shape_mask(iw, ih, shape, max(0, corner_radius - bw)) if iw > 0 and ih > 0 else None
    inner = Image.new("L", (width, height), 0)
    if iw > 0 and ih > 0:
        inner.paste(inner_small if inner_small is not None else Image.new("L", (iw, ih), 255), (bw, bw))
    return ImageChops.subtract(outer, inner)


def make_shadow(mask: Image.Image, shadow: PortraitShadow) -> tuple[Image.Image, tuple[int, int]]:
    """Return (RGBA shadow layer, offset of its top-left relative to the box)."""
    pad = shadow.blur * 3
    w, h = mask.size
    layer_mask = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    layer_mask.paste(mask, (pad, pad))
    if shadow.blur:
        layer_mask = layer_mask.filter(ImageFilter.GaussianBlur(shadow.blur))
    layer_mask = layer_mask.point(lambda v: int(v * shadow.opacity))
    layer = Image.new("RGBA", layer_mask.size, shadow.color + (0,))
    layer.putalpha(layer_mask)
    return layer, (shadow.offset_x - pad, shadow.offset_y - pad)


def paste_portrait(
    base: Image.Image,
    img: Image.Image,
    box: tuple[int, int, int, int],
    style: PortraitStyle | None = None,
    focus: Any = None,
    face_box: tuple[float, float, float, float] | None = None,
) -> list[str]:
    """Frame ``img`` and paste it into ``base`` at ``box`` = (x, y, w, h). Returns warnings."""
    style = style or PortraitStyle()
    x, y, w, h = box
    warnings: list[str] = []
    foc = PortraitFocus.coerce(focus)
    if foc is None and style.face_aware and style.fit == "cover":
        if face_box is None:
            warnings.append("No face was found in a portrait, so it was centred instead.")
    fitted = fit_portrait(img, w, h, style, foc, face_box)
    mask = build_shape_mask(w, h, style.shape, style.corner_radius)
    if style.shadow is not None:
        layer, (ox, oy) = make_shadow(mask or Image.new("L", (w, h), 255), style.shadow)
        base.paste(layer, (x + ox, y + oy), layer)
    paste_mask = mask
    if fitted.mode == "RGBA":
        paste_mask = fitted.getchannel("A") if mask is None else ImageChops.multiply(mask, fitted.getchannel("A"))
    base.paste(fitted, (x, y), paste_mask)
    ring = build_border(mask, w, h, style.border_width, style.shape, style.corner_radius)
    if ring is not None:
        base.paste(Image.new("RGB", (w, h), style.border_color), (x, y), ring)
    return warnings
