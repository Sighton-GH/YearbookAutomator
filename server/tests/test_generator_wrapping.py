from __future__ import annotations

from uuid import uuid4

from PIL import Image, ImageDraw

from app.services.generator import _load_font, _multiline_bbox, _wrap_text


def test_wrap_text_respects_max_width():
    img = Image.new("RGB", (800, 400), "white")
    draw = ImageDraw.Draw(img)

    # Use the project's font loader to avoid hardcoding a font that may not exist
    # on the host OS/image.
    font = _load_font(uuid4().hex, "Inter, system-ui, sans-serif", "normal", size=28)

    mugshot_w = 100
    max_width = int(mugshot_w * 1.5)

    text = "This is a longer quote that should wrap into multiple lines to avoid overlapping other elements."
    lines = _wrap_text(draw, text, font, max_width=max_width)

    assert len(lines) >= 2

    bbox = _multiline_bbox(draw, (0, 0), lines, font, align="left")
    width = bbox[2] - bbox[0]
    assert width <= max_width
