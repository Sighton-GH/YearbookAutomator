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
