from types import SimpleNamespace

import pytest
from PIL import Image, ImageChops, ImageFont

from app.services.text_effects import TextShadow, composite_text
from app.services.text_layout import TextStyle, render_text


def render(style):
    image = Image.new('RGB', (240, 160), 'white')
    render_text(image, text='Avery', box=SimpleNamespace(x=40, y=30, width=180, height=100),
                load_font=lambda s: ImageFont.truetype('DejaVuSans.ttf', s),
                start_size=35, kind='name', style=style)
    return image


def ink(image):
    return ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()


def test_stroke_expands_ink():
    plain = ink(render(TextStyle()))
    outlined = ink(render(TextStyle(stroke_width=3, stroke_color='#ff0000')))
    assert outlined[0] == plain[0] - 3
    assert outlined[2] == plain[2] + 3


def test_shadow_under_foreground():
    image = render(TextStyle(shadow=TextShadow(8, 8, 2, '#ff0000', 0.5)))
    assert (20, 30, 50) in image.getdata()
    assert any(r == 255 and g < 255 and b < 255 for r, g, b in image.getdata())


def test_shadow_offset_does_not_wrap():
    image = Image.new('RGBA', (20, 20))
    def paint(layer):
        layer.putpixel((19, 19), (0, 0, 0, 255))
    composite_text(image, paint, TextShadow(5, 5))
    assert image.getpixel((4, 4))[3] == 0


@pytest.mark.parametrize('args', [{'blur': 21}, {'opacity': -0.1}])
def test_shadow_validation(args):
    with pytest.raises(ValueError):
        TextShadow(**args)
