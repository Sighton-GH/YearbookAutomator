from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw

from app.services.background_removal import remove_background


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_remove_background_simple_keeps_subject_and_clears_corner():
    img = Image.new("RGB", (256, 256), (245, 245, 245))
    d = ImageDraw.Draw(img)
    d.ellipse((56, 40, 200, 240), fill=(30, 60, 200))

    out = remove_background(_png_bytes(img), mode="simple")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    # Corner should be transparent; centre should be opaque.
    assert out_img.getpixel((0, 0))[3] < 20
    assert out_img.getpixel((128, 160))[3] > 200


def test_remove_background_complex_grabcut_outputs_alpha():
    # Busy-ish background with a solid-ish subject.
    rng = np.random.default_rng(123)
    noise = rng.integers(210, 255, size=(256, 256, 3), dtype=np.uint8)
    base = Image.fromarray(noise, mode="RGB")
    d = ImageDraw.Draw(base)
    d.rectangle((70, 50, 190, 230), fill=(20, 20, 20))

    out = remove_background(_png_bytes(base), mode="complex")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    assert out_img.getpixel((0, 0))[3] < 80
    assert out_img.getpixel((128, 140))[3] > 120


def test_remove_background_runs_when_alpha_is_tiny_noise():
    # Some PNGs contain a small number of semi/transparent pixels even when the
    # background is not actually removed. We should still perform background
    # removal in that case.
    img = Image.new("RGBA", (256, 256), (245, 245, 245, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((56, 40, 200, 240), fill=(30, 60, 200, 255))
    # Add a single fully transparent pixel not on the border.
    img.putpixel((128, 10), (245, 245, 245, 0))

    out = remove_background(_png_bytes(img), mode="simple")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    # Corner should be transparent; centre should be opaque.
    assert out_img.getpixel((0, 0))[3] < 20
    assert out_img.getpixel((128, 160))[3] > 200
