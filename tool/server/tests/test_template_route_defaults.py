"""Isolated template route tests using generated images and temporary storage."""
import io

import pytest
from fastapi import FastAPI
from PIL import Image

from app.models.schemas import TemplateParseResponse
from app.routes import templates
from app.services import storage
from live_test_client import LiveTestClient


@pytest.mark.parametrize("area, expected", [(None, 800), (400, 400), (1500, 1500)])
def test_parse_template_uses_default_area_and_preserves_overrides(tmp_path, monkeypatch, area, expected):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    # Access control is outside this isolated route-default test's scope.
    monkeypatch.setattr(templates, "enforce_workspace_write", lambda *_: None)
    captured = {}

    def extract_slots(annotated, **kwargs):
        captured.update(kwargs)
        assert Image.open(annotated).size == (100, 100)
        return TemplateParseResponse(template_id="fictional-workspace", width=100, height=100, slots=[])

    monkeypatch.setattr(templates, "extract_slots", extract_slots)
    png = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(png, "PNG")
    app = FastAPI()
    app.include_router(templates.router, prefix="/templates")
    client = LiveTestClient(app)
    try:
        data = {"workspace_id": "fictional-workspace"}
        if area is not None:
            data["min_area"] = str(area)
        response = client.post(
            "/templates/parse",
            data=data,
            files={
                "annotated_template": ("annotated.png", png.getvalue(), "image/png"),
                "clean_template": ("clean.png", png.getvalue(), "image/png"),
            },
        )
        assert response.status_code == 200
        assert captured["min_area"] == expected
        # Blank colour overrides must still leave detection defaults to the parser.
        assert all(captured[key] is None for key in ("mugshot_hex", "baby_hex", "name_hex", "quote_hex"))
    finally:
        client.close()
