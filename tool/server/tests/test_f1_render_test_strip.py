import pytest
from PIL import Image

from app.models.schemas import GenerationRequest
from app.services.render_test_strip import preview_request, render_test_strip


def payload():
    box = dict(x=10, y=10, width=30, height=40)
    slot = dict(mugshot=box, baby_photo=box, name=box, quote=box)
    return GenerationRequest(workspace_id='fictional-workspace', template_id='fictional-template',
                             font_family='DejaVu Sans', slots=[slot, slot, slot],
                             people=[dict(index=i, first_name='Fictional', last_name=f'Example{i}') for i in range(1, 4)],
                             count_usage=True, output_width=100, output_format='pdf')


def test_preview_is_two_slots_no_usage_and_original_unchanged():
    original = payload()
    request = preview_request(original)
    assert len(request.people) == len(request.slots) == 2
    assert not request.count_usage
    assert request.output_format == 'png'
    assert request.output_filename == 'preview_strip.png'
    assert request.output_width is None
    request.people[0].first_name = 'Other Fictional'
    assert original.people[0].first_name == 'Fictional'
    assert len(original.people) == 3
    assert original.count_usage


def test_unresolved_placement_rejected():
    p = payload()
    p.auto_place = True
    with pytest.raises(ValueError, match='placement'):
        preview_request(p)


def test_render_called_once_then_downscaled():
    calls = []
    def render(request):
        calls.append(request)
        return Image.new('RGB', (2000, 1000), 'blue')
    image = render_test_strip(payload(), render, max_edge=100)
    assert len(calls) == 1
    assert image.size == (100, 50)
    assert image.getpixel((0, 0)) == (0, 0, 255)
