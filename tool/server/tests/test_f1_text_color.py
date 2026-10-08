from types import SimpleNamespace

import pytest
from PIL import Image, ImageFont

from app.services.text_color import parse_text_color
from app.services.text_layout import TextStyle, render_text


@pytest.mark.parametrize('color,expected', [('#141e32', (20, 30, 50)), ('f00', (255, 0, 0)), (' #AbC ', (170, 187, 204))])
def test_color_formats(color, expected):
    assert parse_text_color(color) == expected


@pytest.mark.parametrize('color', ['', '#abcd', 'red', '#00xx00'])
def test_invalid_color_rejected(color):
    with pytest.raises(ValueError):
        parse_text_color(color)


def test_name_color_reaches_pixels():
    image = Image.new('RGB', (200, 100), 'white')
    render_text(image, text='Avery', box=SimpleNamespace(x=10, y=10, width=180, height=80),
                load_font=lambda size: ImageFont.truetype('DejaVuSans.ttf', size),
                start_size=30, kind='name', style=TextStyle(color='#ff0000'))
    assert (255, 0, 0) in image.getdata()
