"""Print sizing and crop marks, using the existing PyMuPDF dependency."""
from io import BytesIO
from pathlib import Path
from PIL import Image
from app.services.portrait_framing import PortraitFocus


def portrait_upscale(source: tuple[int, int], target: tuple[int, int], fit: str, focus=None) -> float:
    ratios = (target[0] / source[0], target[1] / source[1])
    return min(ratios) if fit == "contain" else max(ratios) * (PortraitFocus.coerce(focus) or PortraitFocus()).zoom


def save_pdf_with_crop_marks(image: Image.Image, path: Path, dpi: int) -> None:
    import fitz
    width, height = image.width * 72 / dpi, image.height * 72 / dpi
    margin = 18  # 0.25 inch on each edge; trim stays at the original physical size.
    with fitz.open() as doc:
        page = doc.new_page(width=width + 2 * margin, height=height + 2 * margin)
        trim = fitz.Rect(margin, margin, margin + width, margin + height)
        stream = BytesIO()
        image.save(stream, format="PNG")
        page.insert_image(trim, stream=stream.getvalue())
        page.set_trimbox(trim)
        for x in (trim.x0, trim.x1):
            page.draw_line((x, 3), (x, 12), color=(0, 0, 0), width=0.5)
            page.draw_line((x, trim.y1 + 6), (x, trim.y1 + 15), color=(0, 0, 0), width=0.5)
        for y in (trim.y0, trim.y1):
            page.draw_line((3, y), (12, y), color=(0, 0, 0), width=0.5)
            page.draw_line((trim.x1 + 6, y), (trim.x1 + 15, y), color=(0, 0, 0), width=0.5)
        doc.save(path)
