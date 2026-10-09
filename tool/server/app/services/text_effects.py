"""F1.4 compositing helpers. Draw callbacks receive a full-size RGBA layer."""
from __future__ import annotations

from dataclasses import dataclass
from PIL import Image, ImageFilter

from app.services.text_color import parse_text_color


@dataclass(frozen=True)
class TextShadow:
    offset_x: int = 0
    offset_y: int = 0
    blur: int = 0
    color: str = '#000000'
    opacity: float = 1.0

    def __post_init__(self):
        if not 0 <= self.blur <= 20 or not 0 <= self.opacity <= 1:
            raise ValueError('Shadow blur must be 0-20 and opacity 0-1')
        parse_text_color(self.color)


def composite_text(image, draw_text, shadow: TextShadow | None = None):
    """Composite foreground and optional coloured blurred alpha beneath it.

    Offsets use paste, not wraparound. Original image mode is preserved.
    Shadow blur may extend beyond the text guide box; image edges clip it.
    """
    foreground = Image.new('RGBA', image.size)
    draw_text(foreground)
    base = image.convert('RGBA')
    if shadow is not None and shadow.opacity:
        alpha = foreground.getchannel('A')
        shifted = Image.new('L', image.size)
        shifted.paste(alpha, (shadow.offset_x, shadow.offset_y))
        if shadow.blur:
            shifted = shifted.filter(ImageFilter.GaussianBlur(shadow.blur))
        shifted = shifted.point(lambda v: round(v * shadow.opacity))
        layer = Image.new('RGBA', image.size, parse_text_color(shadow.color) + (0,))
        layer.putalpha(shifted)
        base = Image.alpha_composite(base, layer)
    base = Image.alpha_composite(base, foreground)
    image.paste(base.convert(image.mode))
