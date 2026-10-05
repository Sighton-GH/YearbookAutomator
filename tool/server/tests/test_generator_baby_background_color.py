from __future__ import annotations

import io

import pytest
from PIL import Image, ImageDraw
from pydantic import ValidationError

from app.models.schemas import Box, GenerationRequest, PersonRecord, TemplateSlots
from app.services.generator import generate_composite
from app.services.storage import workspace_dir


@pytest.fixture(autouse=True)
def _isolated_workspace_dir(tmp_path, monkeypatch):
    from app.services import storage

    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(storage, "BASE_DATA", data_dir)


def _png_bytes_rgb(size: tuple[int, int] = (64, 64), color: tuple[int, int, int] = (255, 255, 255)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _png_bytes_rgba_transparent(size: tuple[int, int] = (64, 64)) -> bytes:
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Opaque square in the center so we can distinguish fill vs content.
    draw.rectangle((size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4), fill=(20, 120, 240, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_generate_composite_fills_transparent_baby_pixels_when_configured():
    ws = "ws-baby-bg-color"
    root = workspace_dir(ws)

    # Required template
    (root / "template_clean.png").write_bytes(_png_bytes_rgb((320, 240), (255, 255, 255)))

    baby_dir = root / "baby"
    baby_dir.mkdir(parents=True, exist_ok=True)
    (baby_dir / "transparent.png").write_bytes(_png_bytes_rgba_transparent((64, 64)))

    slot = TemplateSlots(
        mugshot=Box(x=10, y=10, width=64, height=64),
        baby_photo=Box(x=90, y=10, width=64, height=64),
        name=Box(x=10, y=90, width=200, height=24),
        quote=Box(x=10, y=120, width=300, height=60),
    )

    payload = GenerationRequest(
        workspace_id=ws,
        template_id=ws,
        slots=[slot],
        people=[PersonRecord(index=1, first_name="A", last_name="B", baby_photo_filename="transparent.png")],
        default_quote="",
        font_family="DejaVuSans.ttf",
        font_weight="normal",
        all_caps=False,
        align="left",
        baby_background_color="#ff00ff",
    )

    out_path = generate_composite(payload)
    assert out_path.exists()

    with Image.open(out_path) as out:
        out_rgb = out.convert("RGB")
        # Sample a pixel near the top-left of the baby slot: it should be the fill color.
        x = slot.baby_photo.x + 2
        y = slot.baby_photo.y + 2
        assert out_rgb.getpixel((x, y)) == (255, 0, 255)


def _mk_slot(x: int, y: int) -> TemplateSlots:
    mugshot = Box(x=x, y=y, width=64, height=64)
    baby_photo = Box(x=x + 80, y=y, width=64, height=64)
    name = Box(x=x, y=y + 80, width=200, height=24)
    quote = Box(x=x, y=y + 110, width=300, height=60)
    return TemplateSlots(mugshot=mugshot, baby_photo=baby_photo, name=name, quote=quote)


def _base_payload_kwargs(ws: str) -> dict:
    return {
        "workspace_id": ws,
        "template_id": ws,
        "default_quote": "",
        "font_family": "DejaVuSans.ttf",
        "font_weight": "normal",
        "all_caps": False,
        "align": "left",
    }


def test_generate_composite_rejects_more_people_than_slots_before_writing():
    ws = "ws-too-many-people"
    root = workspace_dir(ws)

    # Required template
    (root / "template_clean.png").write_bytes(_png_bytes_rgb((320, 240), (255, 255, 255)))

    slots = [_mk_slot(10, 10), _mk_slot(10, 120)]
    people = [
        PersonRecord(index=1, first_name="A", last_name="One"),
        PersonRecord(index=2, first_name="B", last_name="Two"),
        PersonRecord(index=3, first_name="C", last_name="Three"),
    ]
    payload = GenerationRequest(slots=slots, people=people, **_base_payload_kwargs(ws))

    with pytest.raises(ValueError) as excinfo:
        generate_composite(payload)

    message = str(excinfo.value)
    assert "3 students" in message
    assert "2 slots" in message
    assert list(root.glob("output*")) == []


@pytest.mark.parametrize("color", ["#FFF", "#ffffff", "ffffff"])
def test_baby_background_color_accepts_valid_values(color: str):
    ws = "ws-baby-bg-valid"
    payload = GenerationRequest(
        slots=[_mk_slot(10, 10)],
        people=[PersonRecord(index=1, first_name="A", last_name="B")],
        baby_background_color=color,
        **_base_payload_kwargs(ws),
    )
    assert payload.baby_background_color == color


@pytest.mark.parametrize("color", ["", "   ", None])
def test_baby_background_color_empty_normalises_to_none(color: str | None):
    ws = "ws-baby-bg-empty"
    payload = GenerationRequest(
        slots=[_mk_slot(10, 10)],
        people=[PersonRecord(index=1, first_name="A", last_name="B")],
        baby_background_color=color,
        **_base_payload_kwargs(ws),
    )
    assert payload.baby_background_color is None


def test_baby_background_color_rejects_invalid_hex():
    ws = "ws-baby-bg-invalid"
    with pytest.raises(ValidationError):
        GenerationRequest(
            slots=[_mk_slot(10, 10)],
            people=[PersonRecord(index=1, first_name="A", last_name="B")],
            baby_background_color="#ffgg00",
            **_base_payload_kwargs(ws),
        )
