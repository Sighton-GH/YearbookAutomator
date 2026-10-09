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


def test_generation_loader_applies_real_variable_weight(ws):
    from PIL import Image, ImageDraw
    from types import SimpleNamespace
    from app.services.generator import _styled_loader
    path = make_variable_font(storage.workspace_dir(ws))
    root = storage.workspace_dir(ws) / 'fonts'
    root.mkdir(exist_ok=True)
    import shutil
    shutil.copy(path, root / 'Variable.ttf')
    payload = SimpleNamespace(workspace_id=ws, name_font_style='normal')
    normal = _styled_loader(payload, 'name', 'Variable.ttf', 'normal', [])(36)
    bold = _styled_loader(payload, 'name', 'Variable.ttf', 'bold', [])(36)
    def pixels(font):
        image = Image.new('L', (300, 70))
        ImageDraw.Draw(image).text((4, 4), 'Variable weight', font=font, fill=255)
        return image.tobytes()
    assert pixels(normal) != pixels(bold)
    expected = fs.load_styled_font(ws, 'Variable.ttf', 'bold', 36)
    assert pixels(bold) == pixels(expected)
    # Neither explicit request changes an existing default instance.
    assert pixels(normal) == pixels(_styled_loader(payload, 'name', 'Variable.ttf', 'normal', [])(36))


def test_generation_loader_default_preserves_variable_file_instance(ws):
    from types import SimpleNamespace
    from app.services.generator import _styled_loader, _load_font
    payload = SimpleNamespace(workspace_id=ws, name_font_style='normal')
    normal = _styled_loader(payload, 'name', 'Ubuntu', 'normal', [])(30)
    legacy = _load_font(ws, 'Ubuntu', 'normal', 30)
    assert bytes(normal.getmask('Default pixels')) == bytes(legacy.getmask('Default pixels'))


def make_variable_font(root):
    """Build two real outline masters, then compile a small wght font."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
    from fontTools.varLib import build
    doc = DesignSpaceDocument()
    axis = AxisDescriptor(); axis.name = 'Weight'; axis.tag = 'wght'
    axis.minimum = 400; axis.default = 400; axis.maximum = 700
    doc.addAxis(axis)
    for weight, thickness in [(400, 80), (700, 240)]:
        fb = FontBuilder(1000, isTTF=True)
        chars = sorted(set('Variable weight?'))
        names = ['.notdef'] + ['g' + str(ord(c)) for c in chars]
        fb.setupGlyphOrder(names)
        fb.setupCharacterMap({ord(c): 'g' + str(ord(c)) for c in chars})
        glyphs = {}
        for name in names:
            pen = TTGlyphPen(None)
            if name != 'g32':
                pen.moveTo((0, 0)); pen.lineTo((thickness, 0))
                pen.lineTo((thickness, 700)); pen.lineTo((0, 700)); pen.closePath()
            glyphs[name] = pen.glyph()
        fb.setupGlyf(glyphs)
        fb.setupHorizontalMetrics({name: (500, 0) for name in names})
        fb.setupHorizontalHeader(ascent=800, descent=-200)
        fb.setupNameTable({'familyName': 'Test Variable', 'styleName': 'Regular',
                          'uniqueFontIdentifier': 'TestVariable', 'fullName': 'Test Variable',
                          'psName': 'TestVariable'})
        fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
        fb.setupPost(); fb.setupMaxp()
        path = root / f'master-{weight}.ttf'; fb.save(path)
        source = SourceDescriptor(); source.path = str(path); source.name = str(weight)
        source.location = {'Weight': weight}
        if weight == 400:
            source.copyInfo = source.copyLib = source.copyFeatures = True
        doc.addSource(source)
    designspace = root / 'variable.designspace'; doc.write(designspace)
    font, _, _ = build(str(designspace))
    path = root / 'variable-test.ttf'; font.save(path)
    return path
