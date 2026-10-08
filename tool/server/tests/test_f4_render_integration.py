from PIL import Image
import fitz
import pytest
from app.models.schemas import GenerationRequest, PersonRecord, TemplateSlots
from app.services import generator, storage


def request(tmp_path, monkeypatch, **kwargs):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    ws = storage.workspace_dir("fictional")
    Image.new("RGB", (300, 200), (20, 100, 200)).save(ws / "template_clean.png")
    (ws / "mugshots").mkdir(exist_ok=True)
    (ws / "baby").mkdir(exist_ok=True)
    Image.new("RGB", (20, 20), "red").save(ws / "mugshots" / "portrait.png")
    Image.new("RGBA", (40, 40), (255, 0, 0, 0)).save(ws / "baby" / "baby.png")
    slot = TemplateSlots(**{k: {"x": x, "y": 5, "width": 40, "height": 40}
        for k, x in [("mugshot", 5), ("baby_photo", 55), ("name", 105), ("quote", 155)]})
    return GenerationRequest(workspace_id="fictional", template_id="fictional", font_family="Arial", slots=[slot],
        people=[PersonRecord(index=1, first_name="", last_name="", mugshot_filename="portrait.png", baby_photo_filename="baby.png")], **kwargs)


def test_render_dpi_resolution_and_marks(tmp_path, monkeypatch):
    req = request(tmp_path, monkeypatch, output_dpi=150)
    warnings = []
    out = generator.generate_composite(req, warning_cb=warnings.append)
    with Image.open(out) as image:
        assert image.info["dpi"][0] == pytest.approx(150, abs=0.02)
    assert any("1 portrait is lower resolution" in w for w in warnings)
    req.output_format = "pdf"
    req.crop_marks = True
    out = generator.generate_composite(req)
    with fitz.open(out) as doc:
        assert doc[0].trimbox.width == pytest.approx(144)


@pytest.mark.parametrize("fill, expected", [(None, (20, 100, 200)), ("#ffffff", (255, 255, 255))])
def test_per_person_fill_keeps_transparency_or_fills(tmp_path, monkeypatch, fill, expected):
    req = request(tmp_path, monkeypatch, baby_background_color="#00ff00")
    req.people[0].baby_fill_color = fill
    monkeypatch.setattr(generator, "_load_baby_mask", lambda *a: None)
    monkeypatch.setattr(generator, "_detect_baby_slot_shape", lambda *a: "rect")
    with Image.open(generator.generate_composite(req)) as image:
        assert image.getpixel((60, 10)) == expected


def test_omitted_fill_inherits_global(tmp_path, monkeypatch):
    req = request(tmp_path, monkeypatch, baby_background_color="#00ff00")
    assert "baby_fill_color" not in req.people[0].model_fields_set
    with Image.open(generator.generate_composite(req)) as image:
        assert image.getpixel((60, 10)) == (0, 255, 0)


def test_focus_skips_detector_and_missing_face_warns(tmp_path, monkeypatch):
    req = request(tmp_path, monkeypatch, mugshot_face_aware=True)
    calls = []
    monkeypatch.setattr(generator, "detect_face", lambda img: calls.append(img) or None)
    warnings = []
    generator.generate_composite(req, warning_cb=warnings.append)
    assert len(calls) == 1
    assert any("No face" in w for w in warnings)
    req.people[0].mugshot_focus = {"x": 0.5, "y": 0.5, "zoom": 2}
    generator.generate_composite(req)
    assert len(calls) == 1


def test_request_export_preserves_inherit_vs_explicit_null(tmp_path, monkeypatch):
    import json
    from app.routes.generation import _save_generation_request
    req = request(tmp_path, monkeypatch)
    _save_generation_request(req)
    path = storage.workspace_dir("fictional") / "generation/requests/output.json"
    data = json.loads(path.read_text())
    assert "baby_fill_color" not in data["people"][0]
    req.people[0].baby_fill_color = None
    _save_generation_request(req)
    assert json.loads(path.read_text())["people"][0]["baby_fill_color"] is None


def test_mapping_response_keeps_omitted_fill_omitted():
    p = PersonRecord(index=1, first_name="Alex", last_name="Fiction")
    assert "baby_fill_color" not in p.model_dump()
    restored = PersonRecord.model_validate(p.model_dump())
    assert "baby_fill_color" not in restored.model_fields_set
    p.baby_fill_color = None
    assert p.model_dump()["baby_fill_color"] is None


def test_portrait_detector_exception_falls_back_without_failing_render(tmp_path, monkeypatch):
    req = request(tmp_path, monkeypatch, mugshot_face_aware=True)
    req.people[0].first_name="Fictional"
    def fail(_image):raise RuntimeError("unavailable provider")
    monkeypatch.setattr(generator,"detect_face",fail)
    warnings=[]
    output=generator.generate_composite(req,warning_cb=warnings.append)
    with Image.open(output) as image:assert image.getpixel((10,10))==(255,0,0)
    assert any("Portrait face detection failed for Fictional" in w for w in warnings)
