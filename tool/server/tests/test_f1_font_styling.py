from pathlib import Path

import pytest

from app.services import font_styling as fs, fonts, storage


@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    return 'fictional-workspace'


def test_variation_axes_preserve_order_defaults_and_clamp():
    class Font:
        def set_variation_by_axes(self, values):
            self.values = values
    font = Font()
    axes = [fs.VariationAxis('opsz', 6, 14, 72), fs.VariationAxis('wght', 100, 400, 600),
            fs.VariationAxis('ital', 0, 0, 1), fs.VariationAxis('slnt', -10, 0, 0)]
    fs.apply_variations(font, axes, bold=True, italic=True)
    assert font.values == [14, 600, 1, -10]


def test_italic_face_priority_over_weight():
    regular = fonts.FontFace(Path('regular.ttf'), '', 700, 5, False, False)
    italic = fonts.FontFace(Path('italic.ttf'), '', 400, 5, True, False)
    assert fs._pick([regular, italic], True, True) == italic.path


def test_normal_selector_is_legacy_selector():
    entries = [fonts.FontFace(Path('bold.ttf'), '', 700, 5, False, False),
               fonts.FontFace(Path('regular.ttf'), '', 400, 5, False, False)]
    assert fs._pick(entries, False, False) == fonts._pick_style(entries, False)


def test_missing_italic_warns_and_does_not_crash(ws, monkeypatch):
    monkeypatch.setattr(fs, 'resolve_styled_font_file', lambda *args: None)
    warnings = []
    font = fs.load_styled_font(ws, 'Fictional Missing Family', 'normal', 24, 'italic', warnings)
    assert font is not None
    assert any('Upright text' in w for w in warnings)


def test_real_system_italic_loads(ws):
    path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf')
    if not path.exists():
        pytest.skip('DejaVu oblique face absent')
    warnings = []
    font = fs.load_styled_font(ws, 'DejaVu Sans', 'bold', 24, 'italic', warnings)
    assert 'Oblique' in Path(font.path).name
    assert not warnings
