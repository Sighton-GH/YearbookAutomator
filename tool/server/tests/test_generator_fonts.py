from __future__ import annotations

from uuid import uuid4

from PIL import Image, ImageDraw

from app.services.generator import _load_font


def test_load_font_css_stack_uses_sized_truetype_fallback():
    workspace_id = uuid4().hex
    font = _load_font(workspace_id, 'Inter, system-ui, sans-serif', 'normal', size=40)

    img = Image.new("RGB", (400, 200), "white")
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), "Test", font=font)
    height = bbox[3] - bbox[1]

    # If we fell back to Pillow's tiny bitmap font, height is ~10-12px.
    # A sized TrueType fallback should be noticeably larger.
    assert height > 20
