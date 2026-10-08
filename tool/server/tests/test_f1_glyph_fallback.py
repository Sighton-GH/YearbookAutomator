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
