import fitz
import pytest
from PIL import Image
from pydantic import ValidationError
from app.models.schemas import GenerationRequest
from app.services.print_output import portrait_upscale, save_pdf_with_crop_marks


def test_crop_marks_extend_canvas_and_set_trimbox(tmp_path):
    path = tmp_path / "fictional.pdf"
    save_pdf_with_crop_marks(Image.new("RGB", (600, 300), "white"), path, 300)
    with fitz.open(path) as doc:
        page = doc[0]
        assert page.rect.width == pytest.approx(180)
        assert page.rect.height == pytest.approx(108)
        assert page.trimbox == fitz.Rect(18, 18, 162, 90)
        assert len(page.get_drawings()) == 8
        pix = page.get_pixmap()
        assert pix.width == 180


def test_resolution_scales_fit_and_focus():
    assert portrait_upscale((100, 100), (200, 50), "cover") == 2
    assert portrait_upscale((100, 100), (200, 50), "contain") == 0.5
    assert portrait_upscale((100, 100), (200, 50), "cover", {"zoom": 2}) == 4


@pytest.mark.parametrize("dpi", [71, 1201])
def test_dpi_bounds(dpi):
    with pytest.raises(ValidationError):
        GenerationRequest(workspace_id="fictional", template_id="fictional", slots=[], people=[], font_family="Arial", output_dpi=dpi)
