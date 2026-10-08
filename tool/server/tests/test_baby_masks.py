import io

import cv2
import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from app.models.schemas import Box, TemplateSlots
from app.services import storage
from app.services.baby_masks import regenerate_baby_mask, shape_mask
from app.services.template_parser import extract_slots


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    root = storage.workspace_dir('mask-test')
    (root / 'uploads').mkdir(exist_ok=True)
    img = np.full((300, 400, 3), 255, np.uint8)
    cv2.rectangle(img, (20, 20), (80, 90), (0, 191, 0), -1)
    cv2.ellipse(img, (150, 60), (40, 35), 0, 0, 360, (173, 74, 0), -1)
    cv2.rectangle(img, (20, 130), (180, 160), (31, 117, 255), -1)
    cv2.rectangle(img, (20, 190), (180, 240), (49, 49, 255), -1)
    annotated = cv2.imencode('.png', img)[1].tobytes()
    clean = cv2.imencode('.png', np.full((600, 800, 3), 255, np.uint8))[1].tobytes()
    extract_slots(io.BytesIO(annotated), io.BytesIO(clean), template_id='mask-test', tolerance=0)
    (root / 'uploads' / 'template_annotated.png').write_bytes(annotated)
    (root / 'template_clean.png').write_bytes(clean)
    return root


def test_auto_edit_crops_annotation_in_clean_coordinates(project):
    box = Box(x=210, y=40, width=180, height=160)
    path = regenerate_baby_mask('mask-test', box)
    assert path.name == '210_40_180_160.png'
    mask = Image.open(path)
    assert mask.size == (180, 160)
    assert mask.getpixel((90, 80)) == 255
    assert mask.getpixel((0, 0)) == 0


def test_custom_colour_survives_mask_edit(project):
    annotation = project / 'uploads' / 'template_annotated.png'
    img = cv2.imdecode(np.frombuffer(annotation.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
    cv2.ellipse(img, (150, 60), (40, 35), 0, 0, 360, (255, 0, 255), -1)
    data = cv2.imencode('.png', img)[1].tobytes()
    extract_slots(io.BytesIO(data), io.BytesIO((project / 'template_clean.png').read_bytes()), template_id='mask-test', baby_hex='#ff00ff', tolerance=0)
    annotation.write_bytes(data)
    path = regenerate_baby_mask('mask-test', Box(x=210, y=40, width=180, height=160))
    assert Image.open(path).getpixel((90, 80)) == 255


def test_explicit_shapes_do_not_replace_auto(project):
    box = Box(x=210, y=40, width=180, height=160)
    auto = regenerate_baby_mask('mask-test', box).read_bytes()
    for shape in ('rectangle', 'ellipse', 'rounded'):
        path = regenerate_baby_mask('mask-test', box, shape)
        assert path.name.endswith(f'_{shape}.png')
        assert Image.open(path).getpixel((90, 80)) == 255
    assert regenerate_baby_mask('mask-test', box).read_bytes() == auto
    assert shape_mask(box, 'rectangle').getpixel((0, 0)) == 255
    assert shape_mask(box, 'rounded').getpixel((0, 0)) == 0


def test_empty_and_outside_boxes_are_actionable(project):
    with pytest.raises(ValueError, match='No baby cutout'):
        regenerate_baby_mask('mask-test', Box(x=600, y=400, width=100, height=100))
    with pytest.raises(ValueError, match='inside the template'):
        regenerate_baby_mask('mask-test', Box(x=-1, y=0, width=40, height=40))
    with pytest.raises(ValueError, match='too large'):
        shape_mask(Box(x=0, y=0, width=50000, height=50000), 'ellipse')


def test_schema_default_and_override():
    box = Box(x=0, y=0, width=50, height=50)
    slot = TemplateSlots(mugshot=box, baby_photo=box, name=box, quote=box)
    assert slot.baby_shape is None
    for shape in ('auto', 'rectangle', 'ellipse', 'rounded'):
        assert slot.model_copy(update={'baby_shape': shape}).baby_shape == shape
    with pytest.raises(ValidationError):
        TemplateSlots(mugshot=box, baby_photo=box, name=box, quote=box, baby_shape='triangle')


def test_generator_override_uses_explicit_mask(project, monkeypatch):
    # Exercise placement helper used by generator with the mask supplied by override.
    from app.services.generator import _paste_image
    box = Box(x=0, y=0, width=60, height=60)
    slot = TemplateSlots(mugshot=box, baby_photo=box, name=box, quote=box, baby_shape='rounded')
    output = Image.new('RGB', (60, 60), 'white')
    _paste_image(output, Image.new('RGB', (60, 60), 'red'), slot, 'baby', alpha_mask=shape_mask(box, slot.baby_shape))
    assert output.getpixel((0, 0)) == (255, 255, 255)
    assert output.getpixel((30, 30)) == (255, 0, 0)


def test_endpoint_validates_and_returns_png(project, monkeypatch):
    from fastapi import FastAPI
    from app.routes import templates
    from live_test_client import LiveTestClient
    called = []
    monkeypatch.setattr(templates, 'enforce_workspace_write', lambda request, workspace: called.append(workspace))
    app = FastAPI()
    app.include_router(templates.router, prefix='/api/templates')
    client = LiveTestClient(app)
    try:
        response = client.post('/api/templates/baby-mask', json={
            'workspace_id': 'mask-test', 'box': {'x': 210, 'y': 40, 'width': 180, 'height': 160},
        })
        assert response.status_code == 200
        assert response.headers['content-type'] == 'image/png'
        assert Image.open(io.BytesIO(response.content)).size == (180, 160)
        assert called == ['mask-test']
        bad = client.post('/api/templates/baby-mask', json={
            'workspace_id': 'mask-test', 'box': {'x': 0, 'y': 0, 'width': 0, 'height': 10},
        })
        assert bad.status_code == 422
        missing = client.post('/api/templates/parse', data={'workspace_id': 'mask-test', 'tolerance': '65'})
        assert missing.status_code == 422
    finally:
        client.close()


def test_default_render_matches_base_golden(tmp_path, monkeypatch):
    """Generated from exact base 53b904b; no student data or new settings."""
    import runpy
    import sys
    from pathlib import Path
    from PIL import ImageChops
    script = Path(__file__).parent / 'golden' / 'generate_detection_baby_defaults.py'
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    monkeypatch.setattr(sys, 'argv', [str(script), str(tmp_path)])
    runpy.run_path(str(script), run_name='__main__')
    actual = Image.open(tmp_path / 'render.png').convert('RGB')
    expected = Image.open(script.parent / 'detection_baby_defaults.png').convert('RGB')
    assert ImageChops.difference(actual, expected).getbbox() is None


def test_generation_explicit_shape_uses_override(tmp_path, monkeypatch):
    import runpy
    import sys
    from pathlib import Path
    script = Path(__file__).parent / 'golden' / 'generate_detection_baby_defaults.py'
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    monkeypatch.setattr(sys, 'argv', [str(script), str(tmp_path), 'ellipse'])
    runpy.run_path(str(script), run_name='__main__')
    actual = Image.open(tmp_path / 'render.png')
    assert actual.getpixel((90, 10)) == (255, 255, 255)
    assert actual.getpixel((120, 40)) == (255, 0, 0)

def test_mask_failed_replace_preserves_previous_bytes(project, monkeypatch):
    from app.services import baby_masks
    box = Box(x=210, y=40, width=180, height=160)
    path = regenerate_baby_mask('mask-test', box, 'ellipse')
    previous = path.read_bytes()
    def fail(*args):
        raise OSError('fictional replace failure')
    monkeypatch.setattr(baby_masks.os, 'replace', fail)
    with pytest.raises(OSError):
        regenerate_baby_mask('mask-test', box, 'rectangle')
    assert path.read_bytes() == previous
    assert not list(path.parent.glob('*.tmp'))

def test_mask_checks_quota_before_replacing(project, monkeypatch):
    from app.services import baby_masks
    called = []
    monkeypatch.setattr(baby_masks, 'ensure_workspace_capacity', lambda workspace, count, replacing: called.append((workspace, count, replacing)))
    path = regenerate_baby_mask('mask-test', Box(x=0, y=0, width=20, height=20), 'ellipse')
    assert called[0][0] == 'mask-test' and called[0][1] > 0 and called[0][2] == path
