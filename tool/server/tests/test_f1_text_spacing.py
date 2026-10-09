from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.services.text_spacing import glyph_positions, tracked_bounds
from app.services.text_layout import TextStyle, render_text


def test_pair_kerning_retained():
    font = ImageFont.truetype('DejaVuSans.ttf', 30)
    positions = glyph_positions('AV', font, 4)
    assert positions == [0, font.getlength('AV') - font.getlength('V') + 4]


def test_tracking_increases_ink_width():
    font = ImageFont.truetype('DejaVuSans.ttf', 30)
    draw = ImageDraw.Draw(Image.new('RGB', (400, 100)))
    assert tracked_bounds(draw, 'ABC', font, 5)[2] - tracked_bounds(draw, 'ABC', font, 0)[2] == 10


def test_line_spacing_is_font_size_multiple():
    image = Image.new('RGB', (250, 250), 'white')
    result = render_text(image, text='Avery Example imaginative fictional quote',
                         box=SimpleNamespace(x=10, y=10, width=200, height=400),
                         load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s),
                         start_size=30, kind='quote', style=TextStyle(line_spacing=2))
    assert result.size == 30
    assert len(result.lines) >= 3


@pytest.mark.parametrize('style', [TextStyle(letter_spacing=51), TextStyle(line_spacing=0.4)])
def test_spacing_ranges(style):
    with pytest.raises(ValueError):
        render_text(Image.new('RGB', (100, 100)), text='A', box=None,
                    load_font=None, start_size=20, kind='name', style=style)
