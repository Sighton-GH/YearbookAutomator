from uuid import uuid4

import fitz
from PIL import Image
import pytest

from app.models.schemas import GenerationRequest
from app.services import generator, storage


@pytest.mark.parametrize("output_format", ["png", "pdf", "tiff"])
@pytest.mark.parametrize("output_width", [None, 300])
def test_render_has_print_resolution(tmp_path, monkeypatch, output_format, output_width):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    monkeypatch.setenv("YMGA_RENDER_PREFER_GPU", "false")
    monkeypatch.setenv("YMGA_OPENCL", "false")
    workspace_id = uuid4().hex
    Image.new("RGB", (600, 400), "white").save(
        storage.workspace_dir(workspace_id) / "template_clean.png"
    )
    payload = GenerationRequest(
        workspace_id=workspace_id, template_id="synthetic", font_family="DejaVu Sans", slots=[], people=[],
        output_format=output_format, output_width=output_width,
    )
    result = generator.generate_composite(payload)
    width = output_width or 600
    height = 200 if output_width else 400
    if output_format == "pdf":
        with fitz.open(result) as doc:
            assert doc[0].mediabox.width == pytest.approx(width * 72 / 300)
            assert doc[0].mediabox.height == pytest.approx(height * 72 / 300)
    else:
        with Image.open(result) as image:
            assert image.size == (width, height)
            assert image.info["dpi"] == pytest.approx((300, 300), abs=0.01)
            assert image.getpixel((0, 0)) == (255, 255, 255)
