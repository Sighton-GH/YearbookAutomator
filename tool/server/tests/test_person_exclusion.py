from app.models.schemas import Box, PersonRecord, TemplateSlots
from app.services.placement import assign_logical_slots


def test_exclusion_defaults_and_slot_assignment():
    people = [PersonRecord(index=i, first_name=f"Fictional {i}", last_name="Sample", excluded=i == 1) for i in (1, 2, 3)]
    box = Box(x=0, y=0, width=30, height=30)
    slots = [TemplateSlots(mugshot=box, baby_photo=box, name=box, quote=box)] * 2
    active, logical, _ = assign_logical_slots(people=people, slots=slots, placement_mode="simultaneous")
    assert [p.index for p in active] == [2, 3]
    assert logical == [0, 1]
    assert not PersonRecord(index=1, first_name="Alex", last_name="Sample").excluded
    assert not active[0].added_manually


def test_renderer_exclusions_do_not_exceed_capacity(tmp_path, monkeypatch):
    from PIL import Image
    from app.models.schemas import GenerationRequest
    from app.services import generator, storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    root = storage.workspace_dir("fictional-exclusions")
    Image.new("RGB", (100, 100), "white").save(root / "template_clean.png")
    box = Box(x=0, y=0, width=100, height=100)
    slot = TemplateSlots(mugshot=box, baby_photo=box, name=box, quote=box)
    request = GenerationRequest(workspace_id="fictional-exclusions", template_id="fictional-exclusions", font_family="DejaVuSans.ttf", slots=[slot], people=[PersonRecord(index=1, first_name="Excluded", last_name="Sample", excluded=True), PersonRecord(index=2, first_name="Included", last_name="Sample")])
    names = []
    monkeypatch.setattr(generator, "_render_name", lambda *args, **kwargs: names.append(args[1]))
    generator.generate_composite(request)
    assert names == ["Included Sample"]
