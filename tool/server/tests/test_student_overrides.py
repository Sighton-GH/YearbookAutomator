import pytest
from PIL import Image
from pydantic import ValidationError
from app.models.schemas import Box, GenerationRequest, PersonRecord, TemplateSlots
from app.services import generator, storage


def test_override_contract_validation():
    base = dict(index=1, first_name="Alex", last_name="Example")
    p = PersonRecord(**base)
    assert p.name_color is None and p.hide_baby_photo is None
    for values in ({"name_font_size": 0}, {"quote_font_size": 501}, {"name_color": "red"}):
        with pytest.raises(ValidationError):
            PersonRecord(**base, **values)


def test_default_identity_and_per_student_rendering(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    root = storage.workspace_dir("fictional-overrides")
    Image.new("RGB", (320, 240), "white").save(root / "template_clean.png")
    (root / "baby").mkdir()
    Image.new("RGB", (50, 50), "red").save(root / "baby" / "baby.png")
    slot = TemplateSlots(mugshot=Box(x=10, y=10, width=60, height=60), baby_photo=Box(x=100, y=10, width=60, height=60), name=Box(x=10, y=100, width=250, height=40), quote=Box(x=10, y=150, width=250, height=40))
    person = PersonRecord(index=1, first_name="Alex", last_name="Sample", quote="Hello", baby_photo_filename="baby.png")
    payload = GenerationRequest(workspace_id="fictional-overrides", template_id="fictional-overrides", slots=[slot], people=[person], font_family="DejaVuSans.ttf")
    baseline = Image.open(generator.generate_composite(payload)).copy()
    payload.people = [person.model_copy(update={"name_color": None, "quote_font_size": None, "hide_baby_photo": None})]
    assert Image.open(generator.generate_composite(payload)).tobytes() == baseline.tobytes()
    calls = []
    actual_renderer = generator.render_text
    def render_spy(*args, **kwargs):
        calls.append((kwargs['start_size'], generator._parse_hex_rgb(kwargs['style'].color)))
        return actual_renderer(*args, **kwargs)
    monkeypatch.setattr(generator, 'render_text', render_spy)
    payload.people = [person.model_copy(update={"name_font_size": 31, "quote_font_size": 27, "name_color": "#ff0000", "quote_color": "#00ff00", "hide_baby_photo": True})]
    result = Image.open(generator.generate_composite(payload))
    assert calls == [(31, (255, 0, 0)), (27, (0, 255, 0))]
    assert result.getpixel((110, 20)) == (255, 255, 255)
    assert baseline.getpixel((110, 20)) == (255, 0, 0)


def test_name_edit_provenance_survives_backend_round_trip():
    person = PersonRecord.model_validate(dict(index=1, first_name="Alix", last_name="Example", original_first_name="Alex", original_last_name="Example"))
    assert PersonRecord.model_validate(person.model_dump()).original_first_name == "Alex"
