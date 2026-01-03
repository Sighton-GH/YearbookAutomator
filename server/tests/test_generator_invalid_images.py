from __future__ import annotations

import io

from PIL import Image

from app.models.schemas import Box, GenerationRequest, PersonRecord, TemplateSlots
from app.services.generator import generate_composite
from app.services.storage import workspace_dir


def _png_bytes(size: tuple[int, int] = (64, 64), color: tuple[int, int, int] = (240, 240, 240)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_generate_composite_skips_invalid_baby_file_and_falls_back_to_default():
    ws = "ws-invalid-baby"
    root = workspace_dir(ws)

    # Required template
    (root / "template_clean.png").write_bytes(_png_bytes((320, 240)))

    # Default baby image exists
    baby_dir = root / "baby"
    baby_dir.mkdir(parents=True, exist_ok=True)
    (baby_dir / "default.png").write_bytes(_png_bytes((64, 64), (200, 220, 255)))

    # A non-image file that would crash Pillow if opened as an image
    (baby_dir / "bad.pdf").write_bytes(b"%PDF-1.4\n%not really a pdf but enough to be non-image\n")

    # Mugshot image exists
    mug_dir = root / "mugshots"
    mug_dir.mkdir(parents=True, exist_ok=True)
    (mug_dir / "001.png").write_bytes(_png_bytes((64, 64), (220, 200, 200)))

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
        people=[
            PersonRecord(
                index=1,
                first_name="A",
                last_name="B",
                mugshot_filename="001.png",
                baby_photo_filename="bad.pdf",
                quote="hi",
            )
        ],
        default_quote="",
        default_baby_photo_filename="default.png",
        font_family="DejaVuSans.ttf",
        font_weight="normal",
        all_caps=False,
        align="left",
    )

    out_path = generate_composite(payload)
    assert out_path.exists()

    # The output should be a valid PNG.
    with Image.open(out_path) as out:
        out.verify()
