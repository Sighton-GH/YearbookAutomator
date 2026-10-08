"""F1.8 pure preview preparation. No route, schema or generator mutations."""
from __future__ import annotations

from PIL import Image


def preview_request(payload):
    """Return a deep copy selecting first two resolved slots/people, no usage.

    Call AFTER placement is resolved for the full project. With auto_place still
    on, fail rather than pretend slicing the roster reproduces full placement.
    """
    if payload.auto_place:
        raise ValueError('Resolve full-project placement before creating a test strip')
    count = min(2, len(payload.people), len(payload.slots))
    if not count:
        raise ValueError('At least one student and slot are needed for a test strip')
    copied = payload.model_copy(deep=True)
    return copied.model_copy(update={
        'people': copied.people[:count], 'slots': copied.slots[:count],
        'output_format': 'png', 'output_filename': 'preview_strip.png',
        'count_usage': False, 'output_width': None, 'output_height': None,
    })


def render_test_strip(payload, render, *, max_edge: int = 1200) -> Image.Image:
    """Call injected full renderer once and return a downscaled RGB preview.

    render(request) must return a Pillow image or local image path. No new
    dependencies or async job assumptions. Does not itself publish/store output.
    """
    if max_edge < 1:
        raise ValueError('Preview size must be positive')
    request = preview_request(payload)
    output = render(request)
    if isinstance(output, Image.Image):
        image = output.convert('RGB')
    else:
        with Image.open(output) as opened:
            image = opened.convert('RGB')
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return image
