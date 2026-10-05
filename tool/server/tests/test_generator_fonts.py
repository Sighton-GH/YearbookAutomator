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


import shutil
from pathlib import Path
import pytest

LIB = Path("/usr/share/fonts/truetype/liberation")


@pytest.fixture
def ws(tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()
    wid = uuid4().hex
    storage.workspace_dir(wid)
    return wid


@pytest.mark.skipif(not (LIB / "LiberationSerif-Regular.ttf").exists(), reason="Liberation fonts not installed")
def test_system_font_family_name_resolves_to_that_family(ws):
    font = _load_font(ws, '"Liberation Serif"', "normal", size=30)
    assert Path(font.path).name == "LiberationSerif-Regular.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSerif-Bold.ttf").exists(), reason="Liberation fonts not installed")
def test_bold_weight_picks_bold_face(ws):
    font = _load_font(ws, '"Liberation Serif"', "bold", size=30)
    assert Path(font.path).name == "LiberationSerif-Bold.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSerif-Regular.ttf").exists(), reason="Liberation fonts not installed")
def test_uploaded_font_resolves_by_family_name_even_when_filename_differs(ws):
    from app.services import storage
    fonts_dir = storage.workspace_dir(ws) / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(LIB / "LiberationSerif-Regular.ttf", fonts_dir / "MySchoolFont.ttf")
    font = _load_font(ws, '"Liberation Serif"', "normal", size=30)
    assert Path(font.path).parent == fonts_dir


def test_uploaded_font_by_filename_still_works(ws):
    from app.services import storage
    src = Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")
    if not src.exists():
        pytest.skip("DejaVuSerif not installed")
    fonts_dir = storage.workspace_dir(ws) / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, fonts_dir / "Custom.ttf")
    font = _load_font(ws, "Custom.ttf", "normal", size=30)
    assert Path(font.path).name == "Custom.ttf"


def test_every_picker_font_resolves_to_its_own_family(ws):
    from PIL import ImageFont

    from app.services import fonts
    entries = fonts.list_system_fonts()
    if not entries:
        pytest.skip("no system fonts")
    mismatches = []
    skipped_unloadable = []
    for entry in entries:
        # Bitmap-only fonts (e.g. Noto Color Emoji, single embedded strike) cannot be
        # loaded by Pillow at arbitrary sizes; falling back for those is correct, so
        # only assert the roundtrip for fonts Pillow can actually render at this size.
        try:
            ImageFont.truetype(entry["filename"], size=20)
        except Exception:
            skipped_unloadable.append(entry["name"])
            continue
        font = _load_font(ws, f'"{entry["name"]}"', "normal", size=20)
        got = fonts._font_name_from_file(Path(font.path)).lower()
        if got != entry["name"].lower():
            mismatches.append((entry["name"], str(font.path), got))
    assert not mismatches, mismatches[:10]


def test_condensed_family_name_resolves(ws):
    src = Path("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf")
    if not src.exists():
        pytest.skip("DejaVuSansCondensed not installed")
    font = _load_font(ws, '"DejaVu Sans Condensed"', "normal", 20)
    assert str(font.path).endswith("DejaVuSansCondensed.ttf")
    if Path("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf").exists():
        bold = _load_font(ws, '"DejaVu Sans Condensed"', "bold", 20)
        assert str(bold.path).endswith("DejaVuSansCondensed-Bold.ttf")


DEJAVU = Path("/usr/share/fonts/truetype/dejavu")
UBUNTU = Path("/usr/share/fonts/truetype/ubuntu")


@pytest.mark.skipif(not (DEJAVU / "DejaVuSans.ttf").exists(), reason="DejaVu not installed")
def test_dejavu_sans_regular_and_bold(ws):
    font = _load_font(ws, '"DejaVu Sans"', "normal", size=30)
    assert Path(font.path).name == "DejaVuSans.ttf"


@pytest.mark.skipif(not (DEJAVU / "DejaVuSans-Bold.ttf").exists(), reason="DejaVu not installed")
def test_dejavu_sans_bold_picks_bold(ws):
    font = _load_font(ws, '"DejaVu Sans"', "bold", size=30)
    assert Path(font.path).name == "DejaVuSans-Bold.ttf"


@pytest.mark.skipif(not (UBUNTU / "Ubuntu-R.ttf").exists(), reason="Ubuntu not installed")
def test_ubuntu_regular(ws):
    font = _load_font(ws, '"Ubuntu"', "normal", size=30)
    assert Path(font.path).name == "Ubuntu-R.ttf"


@pytest.mark.skipif(not (UBUNTU / "Ubuntu-B.ttf").exists(), reason="Ubuntu not installed")
def test_ubuntu_bold(ws):
    font = _load_font(ws, '"Ubuntu"', "bold", size=30)
    assert Path(font.path).name == "Ubuntu-B.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSans-Regular.ttf").exists(), reason="Liberation fonts not installed")
def test_liberation_sans_regular(ws):
    font = _load_font(ws, '"Liberation Sans"', "normal", size=30)
    assert Path(font.path).name == "LiberationSans-Regular.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSans-Bold.ttf").exists(), reason="Liberation fonts not installed")
def test_liberation_sans_bold(ws):
    font = _load_font(ws, '"Liberation Sans"', "bold", size=30)
    assert Path(font.path).name == "LiberationSans-Bold.ttf"


@pytest.mark.skipif(not (DEJAVU / "DejaVuSansCondensed.ttf").exists(), reason="DejaVu not installed")
def test_dejavu_sans_condensed_regular(ws):
    font = _load_font(ws, '"DejaVu Sans Condensed"', "normal", size=30)
    assert Path(font.path).name == "DejaVuSansCondensed.ttf"
