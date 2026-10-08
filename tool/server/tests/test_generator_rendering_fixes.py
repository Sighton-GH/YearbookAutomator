from types import SimpleNamespace
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont
import pytest

from app.services import generator as g

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _font(size):
    return ImageFont.truetype(DEJAVU, size)


def _ink_bbox(img):
    inv = Image.eval(img.convert("L"), lambda v: 255 - v)
    return inv.getbbox()


def test_long_name_shrinks_to_fit_box_width():
    img = Image.new("RGB", (400, 100), "white")
    box = SimpleNamespace(x=10, y=10, width=200, height=60)
    g._render_name(ImageDraw.Draw(img), "Alexandria Featherington-Wetherby", box, _font, 40, "left", False)
    left, top, right, bottom = _ink_bbox(img)
    assert right <= box.x + box.width + 1


def test_centre_aligned_name_is_centred_in_box():
    img = Image.new("RGB", (600, 100), "white")
    box = SimpleNamespace(x=100, y=10, width=400, height=60)
    g._render_name(ImageDraw.Draw(img), "Ann Lee", box, _font, 30, "center", False)
    left, _, right, _ = _ink_bbox(img)
    assert abs(((left + right) / 2) - (box.x + box.width / 2)) <= 3


def test_exif_rotated_photo_is_transposed(tmp_path):
    img = Image.new("RGB", (40, 20), "red")
    exif = img.getexif()
    exif[0x0112] = 6  # rotate 90 CW when displayed
    path = tmp_path / "p.jpg"
    img.save(path, exif=exif.tobytes())
    opened = g._open_rgb_upright(path)
    assert opened.size == (20, 40)


def test_transparent_template_composites_on_white(tmp_path):
    path = tmp_path / "t.png"
    Image.new("RGBA", (10, 10), (0, 0, 0, 0)).save(path)
    assert g._open_template_rgb(path).getpixel((5, 5)) == (255, 255, 255)


def test_baby_mask_found_after_small_slot_nudge(tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()
    wid = uuid4().hex
    masks = storage.workspace_dir(wid) / "masks" / "baby"
    masks.mkdir(parents=True)
    Image.new("L", (100, 80), 255).save(masks / "50_60_100_80.png")
    nudged = SimpleNamespace(x=52, y=59, width=100, height=80)
    assert g._find_baby_mask_path(wid, nudged) == masks / "50_60_100_80.png"
    far = SimpleNamespace(x=400, y=400, width=100, height=80)
    assert g._find_baby_mask_path(wid, far) is None
