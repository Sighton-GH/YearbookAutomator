from PIL import Image, ImageDraw, ImageFont

from app.services import glyph_fallback as gf


def test_latin_run_stays_whole():
    primary = ImageFont.truetype('DejaVuSans.ttf', 24)
    runs = gf.glyph_runs('Avery Example', primary, 24, paths=())
    assert len(runs) == 1
    assert runs[0].text == 'Avery Example'


def test_missing_glyph_is_announced():
    primary = ImageFont.truetype('DejaVuSans.ttf', 24)
    warnings = []
    runs = gf.glyph_runs('\U0010ffff', primary, 24, paths=(), warnings=warnings)
    assert runs[0].text == '?'
    assert 'U+10FFFF' in warnings[0]


def test_rtl_without_raqm_warns(monkeypatch):
    monkeypatch.setattr(gf.features, 'check', lambda _: False)
    warnings = []
    assert gf.script_kwargs('مرحبا', warnings=warnings) == {}
    assert warnings


def test_rtl_with_raqm_passes_direction_language(monkeypatch):
    monkeypatch.setattr(gf.features, 'check', lambda _: True)
    assert gf.script_kwargs('مرحبا', 'ar') == {'direction': 'rtl', 'language': 'ar'}


def test_unicode_surrogate_and_emoji_do_not_crash():
    font = ImageFont.truetype('DejaVuSans.ttf', 24)
    warnings = []
    gf.draw_unicode(ImageDraw.Draw(Image.new('RGB', (500, 100))), (0, 0),
                    'Avery\ud800\U0010ffff😀', font, 24, paths=(), warnings=warnings)
    assert warnings


def test_fallback_cache_uses_codepoint_and_path_set(monkeypatch):
    gf.clear_glyph_caches()
    monkeypatch.setattr(gf, 'font_coverage', lambda p: frozenset({ord('中')}) if p == 'cjk.ttf' else frozenset())
    assert gf.fallback_path(ord('中'), ('latin.ttf', 'cjk.ttf')) == 'cjk.ttf'
    assert gf.fallback_path(ord('中'), ('latin.ttf',)) is None
    gf.fallback_path.cache_clear()


from types import SimpleNamespace
from pathlib import Path
import pytest
from PIL import ImageChops, features
from app.services.text_layout import render_text, TextStyle


def test_fallback_fit_and_draw_share_real_font_runs(monkeypatch, tmp_path):
    primary = ImageFont.truetype('LiberationSans-Regular.ttf', 32)
    fallback = ImageFont.truetype('DejaVuSans.ttf', 32)
    monkeypatch.setattr(gf, 'system_font_paths', lambda: (str(fallback.path),))
    # Arabic is missing from Liberation but exists in DejaVu. Keep the
    # paragraph LTR so this also checks first-strong direction selection.
    text = 'A ش B'
    assert ord('ش') not in gf.font_coverage(primary.path)
    probe = Image.new('RGB', (300, 90), 'white')
    draw = gf.UnicodeDraw(ImageDraw.Draw(probe), [], (str(fallback.path),))
    bounds = draw.textbbox((0, 0), text, primary)
    width = int(bounds[2] - bounds[0]) + 4
    warnings = []
    result = render_text(probe, text=text, box=SimpleNamespace(x=4, y=4, width=width, height=65),
                         load_font=lambda s: ImageFont.truetype(primary.path, s),
                         start_size=32, kind='name', style=TextStyle(color='#000000'), warnings=warnings)
    assert result.size == 32 and not result.overflow
    expected = Image.new('RGB', probe.size, 'white')
    gf.UnicodeDraw(ImageDraw.Draw(expected), [], (str(fallback.path),)).text((4, 4), text, primary, (0, 0, 0))
    assert probe.tobytes() == expected.tobytes()
    assert ImageChops.difference(probe, Image.new('RGB', probe.size, 'white')).getbbox()[2] <= 4 + width
    probe.save(tmp_path / 'fallback.png')


@pytest.mark.skipif(not features.check('raqm'), reason='RAQM not installed')
def test_rtl_real_render_matches_whole_shaped_run():
    primary = ImageFont.truetype('DejaVuSans.ttf', 32)
    text = 'مرحبا بالعالم'
    actual = Image.new('RGB', (300, 90), 'white')
    expected = actual.copy()
    render_text(actual, text=text, box=SimpleNamespace(x=8, y=8, width=280, height=70),
                load_font=lambda s: ImageFont.truetype(primary.path, s), start_size=32,
                kind='name', style=TextStyle(color='#000000'))
    ImageDraw.Draw(expected).text((8, 8), text, font=primary, fill='black', anchor='la', direction='rtl')
    assert actual.tobytes() == expected.tobytes()


def test_unicode_render_surrogates_missing_emoji_and_controls(monkeypatch):
    monkeypatch.setattr(gf, 'system_font_paths', lambda: ())
    warnings = []
    result = render_text(Image.new('RGB', (300, 90), 'white'),
                         text='A\ud800\U0010ffff😀\u200d\ufe0f',
                         box=SimpleNamespace(x=4, y=4, width=280, height=70),
                         load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s),
                         start_size=28, kind='name', warnings=warnings)
    assert result.size == 28
    assert any('U+D800' in w for w in warnings)
    assert not any('U+200D' in w or 'U+FE0F' in w for w in warnings)


def test_fallback_measurement_wrapping_and_tracking(monkeypatch):
    fallback = ImageFont.truetype('DejaVuSans.ttf', 26)
    monkeypatch.setattr(gf, 'system_font_paths', lambda: (fallback.path,))
    image = Image.new('RGB', (150, 200), 'white')
    result = render_text(image, text='A ش B A ش B', box=SimpleNamespace(x=5, y=5, width=130, height=180),
                         load_font=lambda s: ImageFont.truetype('LiberationSans-Regular.ttf', s),
                         start_size=26, kind='quote', style=TextStyle(letter_spacing=2))
    assert len(result.lines) > 1
    assert not result.overflow
    assert ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()[2] <= 135


def test_first_strong_direction_keeps_latin_paragraph_ltr():
    assert gf.script_kwargs('Avery مرحبا') == {}


def build_test_fallback(root, *, color=False):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.colorLib.builder import buildCOLR, buildCPAL
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'wide', 'paint'])
    fb.setupCharacterMap({ord('中'): 'wide', ord('😀'): 'wide'})
    glyphs = {}
    for name in ['.notdef', 'wide', 'paint']:
        pen = TTGlyphPen(None)
        pen.moveTo((20, 0)); pen.lineTo((850, 0)); pen.lineTo((850, 700)); pen.lineTo((20, 700)); pen.closePath()
        glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: (900, 20) for name in glyphs})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': 'Fallback Test', 'styleName': 'Regular',
                      'uniqueFontIdentifier': 'FallbackTest', 'fullName': 'Fallback Test', 'psName': 'FallbackTest'})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost(); fb.setupMaxp()
    if color:
        fb.font['COLR'] = buildCOLR({'wide': [('paint', 0)]})
        fb.font['CPAL'] = buildCPAL([[(1, 0, 0, 1)]])
    path = root / ('color.ttf' if color else 'cjk.ttf')
    fb.save(path)
    return path


def test_cjk_fallback_real_font_wraps_by_actual_wide_glyphs(monkeypatch, tmp_path):
    fallback = build_test_fallback(tmp_path)
    monkeypatch.setattr(gf, 'system_font_paths', lambda: (str(fallback),))
    image = Image.new('RGB', (90, 180), 'white')
    result = render_text(image, text='中中中中中', box=SimpleNamespace(x=5, y=5, width=75, height=160),
                         load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s), start_size=30,
                         kind='quote', warnings=[])
    assert result.size == 30 and result.lines == ('中中', '中中', '中')
    assert not result.overflow
    assert ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()[2] <= 80


def test_colr_emoji_color_reaches_real_renderer(monkeypatch, tmp_path):
    fallback = build_test_fallback(tmp_path, color=True)
    # A monochrome primary already covers this emoji; color is preferred only
    # when falling back. This primary does not cover it.
    primary = ImageFont.truetype('LiberationSans-Regular.ttf', 32)
    assert ord('😀') not in gf.font_coverage(primary.path)
    monkeypatch.setattr(gf, 'system_font_paths', lambda: (str(fallback),))
    image = Image.new('RGB', (120, 80), 'white')
    warnings = []
    render_text(image, text='A😀', box=SimpleNamespace(x=5, y=5, width=110, height=70),
                load_font=lambda s: ImageFont.truetype(primary.path, s), start_size=32,
                kind='name', warnings=warnings)
    assert any(r > 200 and g < 20 and b < 20 for r, g, b in image.getdata())
    assert not any('Colour emoji' in w for w in warnings)


def test_color_emoji_preferred_even_when_primary_has_monochrome(monkeypatch, tmp_path):
    path = build_test_fallback(tmp_path, color=True)
    primary = ImageFont.truetype('DejaVuSans.ttf', 32)
    assert ord('😀') in gf.font_coverage(primary.path)
    runs = gf.glyph_runs('😀', primary, 32, paths=(str(path),), warnings=[])
    assert runs[0].embedded_color and str(runs[0].font.path) == str(path)


def test_generation_unicode_wiring_and_warning_callback(tmp_path, monkeypatch):
    from app.models.schemas import GenerationRequest
    from app.services import generator, storage
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    monkeypatch.setattr(gf, 'system_font_paths', lambda: ())
    root = storage.workspace_dir('unicode-render')
    Image.new('RGB', (450, 250), 'white').save(root / 'template_clean.png')
    payload = GenerationRequest(workspace_id='unicode-render', template_id='test', font_family='DejaVu Sans',
        name_font_family='DejaVu Sans', quote_font_family='DejaVu Sans',
        slots=[dict(mugshot=dict(x=5, y=5, width=60, height=80),
                    baby_photo=dict(x=80, y=5, width=40, height=40),
                    name=dict(x=5, y=100, width=430, height=60),
                    quote=dict(x=200, y=5, width=230, height=80))],
        people=[dict(index=1, first_name='Avery\U0010ffff', last_name='Example', quote='مرحبا')])
    warnings = []
    path = generator.generate_composite(payload, warning_cb=warnings.append)
    assert path.is_file()
    assert any('U+10FFFF' in w for w in warnings)
    assert ImageChops.difference(Image.open(path).convert('RGB'), Image.new('RGB', (450, 250), 'white')).getbbox()


def test_layout_language_forwarded_to_measurement_and_drawing(monkeypatch):
    calls = []
    original = gf.script_kwargs
    def record(text, language=None, warnings=None):
        calls.append(language)
        return original(text, language, warnings)
    monkeypatch.setattr(gf, 'script_kwargs', record)
    render_text(Image.new('RGB', (300, 90), 'white'), text='مرحبا',
                box=SimpleNamespace(x=8, y=8, width=280, height=70),
                load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s),
                start_size=32, kind='name', style=TextStyle(language='ar'))
    assert calls and all(lang == 'ar' for lang in calls)

def test_regular_fallback_stops_before_unneeded_font_files(monkeypatch):
    gf.fallback_path.cache_clear()
    inspected = []
    def coverage(path):
        inspected.append(path)
        return frozenset({ord('中')})
    monkeypatch.setattr(gf, 'font_coverage', coverage)
    assert gf.fallback_path(ord('中'), ('first.ttf', 'unused.ttf')) == 'first.ttf'
    assert inspected == ['first.ttf']
    gf.fallback_path.cache_clear()
