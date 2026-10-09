from types import SimpleNamespace

from PIL import Image, ImageFont

from app.services.text_layout import TextStyle, render_text


def run(text, width=150, start=35, minimum=8, style=TextStyle()):
    warnings = []
    result = render_text(Image.new('RGB', (400, 180), 'white'), text=text,
                         box=SimpleNamespace(x=10, y=10, width=width, height=140),
                         load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s),
                         start_size=start, min_size=minimum, kind='name', style=style,
                         warnings=warnings, student='Avery Example')
    return result, warnings


def test_wrap_uses_two_lines_before_shrink():
    wrapped, warnings = run('Avery Example', style=TextStyle(name_fit='wrap'))
    shrunk, _ = run('Avery Example')
    assert len(wrapped.lines) == 2
    assert wrapped.size > shrunk.size
    assert not warnings


def test_minimum_overflow_keeps_entire_name_and_warns():
    result, warnings = run('Avery Example Fictional Student', width=8, minimum=20,
                            style=TextStyle(name_fit='wrap'))
    assert result.size == 20
    assert result.overflow
    assert len(result.lines) <= 2
    assert 'Avery Example' in warnings[0]
    assert ''.join(result.lines).replace(' ', '') == 'AveryExampleFictionalStudent'


def test_start_below_minimum_renders_at_minimum():
    result, _ = run('Avery', start=5, minimum=12)
    assert result.size == 12


def test_default_overflow_pixels_unchanged_but_announced():
    result, warnings = run('Avery Example', width=1)
    assert result.overflow
    assert warnings
