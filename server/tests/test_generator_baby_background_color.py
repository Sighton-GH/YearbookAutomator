from __future__ import annotations

import io

from PIL import Image, ImageDraw

from app.models.schemas import Box, GenerationRequest, PersonRecord, TemplateSlots
from app.services.generator import generate_composite
from app.services.storage import workspace_dir


def _png_bytes_rgb(size: tuple[int, int] = (64, 64), color: tuple[int, int, int] = (255, 255, 255)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _png_bytes_rgba_transparent(size: tuple[int, int] = (64, 64)) -> bytes:
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Opaque square in the center so we can distinguish fill vs content.
    draw.rectangle((size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4), fill=(20, 120, 240, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_generate_composite_fills_transparent_baby_pixels_when_configured():
    ws = "ws-baby-bg-color"
    root = workspace_dir(ws)

    # Required template
    (root / "template_clean.png").write_bytes(_png_bytes_rgb((320, 240), (255, 255, 255)))

    baby_dir = root / "baby"
    baby_dir.mkdir(parents=True, exist_ok=True)
    (baby_dir / "transparent.png").write_bytes(_png_bytes_rgba_transparent((64, 64)))

    slot = TemplateSlots(
        mugshot=Box(x=10, y=10, width=64, height=64),
        baby_photo=Box(x=90, y=10, width=64, height=64),
        name=Box(x=10, y=90, width=200, height=24),
        quote=Box(x=10, y=120, width=300, height=60),
    )

    payload = GenerationRequest(
        workspace_id=ws,
        template_id=ws,
        slots=[slot],
        people=[PersonRecord(index=1, first_name="A", last_name="B", baby_photo_filename="transparent.png")],
        default_quote="",
        font_family="DejaVuSans.ttf",
        font_weight="normal",
        all_caps=False,
        align="left",
        baby_background_color="#ff00ff",
    )

    out_path = generate_composite(payload)
    assert out_path.exists()

    with Image.open(out_path) as out:
        out_rgb = out.convert("RGB")
        # Sample a pixel near the top-left of the baby slot: it should be the fill color.
        x = slot.baby_photo.x + 2
        y = slot.baby_photo.y + 2
        assert out_rgb.getpixel((x, y)) == (255, 0, 255)
