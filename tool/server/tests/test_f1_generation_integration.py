"""F1 end to end through generate_composite. Fictional data only."""
from uuid import uuid4

import pytest
from PIL import Image, ImageChops, ImageDraw

from app.models.schemas import GenerationRequest, PersonRecord
from app.services import generator, storage

SLOT = {
    "mugshot": {"x": 20, "y": 20, "width": 120, "height": 150},
    "baby_photo": {"x": 300, "y": 20, "width": 60, "height": 60},
    "name": {"x": 20, "y": 180, "width": 200, "height": 40},
    "quote": {"x": 20, "y": 230, "width": 220, "height": 120},
}
QUOTE = "A fictional quote that is long enough to wrap onto more than one line here."


def _setup(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    monkeypatch.setenv("YMGA_RENDER_PREFER_GPU", "false")
    monkeypatch.setenv("YMGA_OPENCL", "false")
    workspace_id = uuid4().hex
    Image.new("RGB", (400, 400), "white").save(storage.workspace_dir(workspace_id) / "template_clean.png")
    return workspace_id


def _render(workspace_id, name, **extra):
    payload = GenerationRequest(
        workspace_id=workspace_id, template_id="t", font_family="DejaVu Sans",
        slots=[SLOT], people=[PersonRecord(index=1, first_name="Avery", last_name="Bennett", quote=QUOTE)],
        output_filename=name, name_font_size=30, quote_font_size=18, **extra,
    )
    warnings: list[str] = []
    path = generator.generate_composite(payload, warning_cb=warnings.append)
    with Image.open(path) as img:
        return img.convert("RGB"), warnings


def test_defaults_match_base_renderer_pixels(tmp_path, monkeypatch):
    workspace_id = _setup(tmp_path, monkeypatch)
    image, warnings = _render(workspace_id, "output.png")
    expected = Image.new("RGB", (400, 400), "white")
    draw = ImageDraw.Draw(expected)
    load = lambda s: generator._load_font(workspace_id, "DejaVu Sans", "normal", size=s)

    class B:
        def __init__(self, d):
            self.__dict__.update(d)

    slot_name, slot_quote, mug = B(SLOT["name"]), B(SLOT["quote"]), B(SLOT["mugshot"])
    generator._render_name(draw, "Avery Bennett", slot_name, load, 30, "left", False)
    generator._render_wrapped_text(
        draw=draw, load_font=load, text=QUOTE, box=slot_quote,
        max_width=min(slot_quote.width, int(mug.width * 1.5)), start_size=18, align="left",
        all_caps=False, max_height=mug.height, spacing=0)
    assert ImageChops.difference(image, expected).getbbox() is None
    assert warnings == []


def test_explicit_default_values_are_identical(tmp_path, monkeypatch):
    workspace_id = _setup(tmp_path, monkeypatch)
    plain, _ = _render(workspace_id, "output_a.png")
    explicit, _ = _render(
        workspace_id, "output_b.png", name_color="#141e32", quote_color="#141E32", name_valign="top",
        quote_valign="top", name_letter_spacing=0, name_stroke_width=0, name_font_style="normal",
        name_fit="shrink", name_min_size=8, quote_min_size=8)
    assert ImageChops.difference(plain, explicit).getbbox() is None


def test_new_controls_change_output(tmp_path, monkeypatch):
    workspace_id = _setup(tmp_path, monkeypatch)
    plain, _ = _render(workspace_id, "output_a.png")
    red, _ = _render(workspace_id, "output_b.png", name_color="#ff0000")
    assert any(r > 200 and g < 60 for r, g, b in red.crop((20, 180, 220, 220)).getdata())
    right, _ = _render(workspace_id, "output_c.png", name_align="right")
    box = right.crop((20, 180, 220, 220))
    bbox = ImageChops.difference(box, Image.new("RGB", box.size, "white")).getbbox()
    assert bbox and bbox[2] > 150  # ink reaches the right side of the 200px box
    shadowed, _ = _render(workspace_id, "output_d.png", quote_shadow={"offset_x": 3, "offset_y": 3, "blur": 2, "color": "#00ff00", "opacity": 1})
    assert ImageChops.difference(plain, shadowed).getbbox() is not None


def test_overflow_at_minimum_size_is_announced_with_student_name(tmp_path, monkeypatch):
    workspace_id = _setup(tmp_path, monkeypatch)
    _, warnings = _render(workspace_id, "output.png", name_min_size=60, name_fit="shrink")
    assert any("Avery Bennett" in w for w in warnings)


def test_invalid_colour_and_ranges_rejected():
    with pytest.raises(ValueError):
        GenerationRequest(workspace_id="w", template_id="t", slots=[], people=[], font_family="x", name_color="red")
    with pytest.raises(ValueError):
        GenerationRequest(workspace_id="w", template_id="t", slots=[], people=[], font_family="x", quote_line_spacing=9)
    with pytest.raises(ValueError):
        GenerationRequest(workspace_id="w", template_id="t", slots=[], people=[], font_family="x", name_align="justify")
