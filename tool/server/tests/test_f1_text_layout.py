from types import SimpleNamespace

import pytest
from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.services import generator
from app.services.text_layout import TextStyle, render_text


@pytest.fixture
def font():
    return lambda size: ImageFont.truetype('DejaVuSans.ttf', size)


@pytest.fixture
def box():
    return SimpleNamespace(x=20, y=20, width=180, height=120)


def ink(image):
    return ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()


@pytest.mark.parametrize('kind', ['name', 'quote'])
@pytest.mark.parametrize('align', ['left', 'center'])
def test_defaults_are_identical_to_base_renderer(font, box, kind, align):
    old = Image.new('RGB', (240, 180), 'white')
    new = old.copy()
    text = 'Fictional Avery Example has an imaginative quote'
    if kind == 'name':
        generator._render_name(ImageDraw.Draw(old), text, box, font, 28, align, False)
    else:
        generator._render_wrapped_text(draw=ImageDraw.Draw(old), text=text, box=box,
                                      load_font=font, start_size=28, align=align,
                                      all_caps=False, max_width=180, max_height=120)
    render_text(new, text=text, box=box, load_font=font, start_size=28, kind=kind,
                style=TextStyle(align=align))
    assert old.tobytes() == new.tobytes()


def test_right_bottom_name(font, box):
    image = Image.new('RGB', (240, 180), 'white')
    render_text(image, text='Avery Example', box=box, load_font=font,
                start_size=24, kind='name', style=TextStyle('right', 'bottom'))
    _, _, right, bottom = ink(image)
    assert abs(right - 200) <= 2
    assert bottom == 140


def test_vertical_alignment_uses_quote_area_not_guide_height(font, box):
    image = Image.new('RGB', (240, 180), 'white')
    render_text(image, text='Avery', box=box, load_font=font,
                start_size=24, kind='quote', max_height=70,
                style=TextStyle('left', 'middle'))
    _, top, _, bottom = ink(image)
    assert abs((top + bottom) / 2 - 55) <= 1


def test_justify_expands_nonlast_line_and_leaves_last_left(font, box):
    image = Image.new('RGB', (240, 180), 'white')
    result = render_text(image, text='one two three four five six seven', box=box,
                         load_font=font, start_size=24, kind='quote',
                         style=TextStyle('justify'))
    assert len(result.lines) > 1
    assert ink(image)[2] >= 198


def test_names_cannot_be_justified(font, box):
    with pytest.raises(ValueError):
        render_text(Image.new('RGB', (240, 180)), text='Avery', box=box,
                    load_font=font, start_size=24, kind='name', style=TextStyle('justify'))
