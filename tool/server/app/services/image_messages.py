"""Plain-language messages shared by image upload paths."""
from pathlib import Path

HEIC_MESSAGE = "iPhone HEIC photos aren't supported yet - export them as JPEG"
BACKGROUND_FAILURE = "Could not remove the background. Try another mode or a different photo."


def unsupported_image_message(filename: str) -> str:
    if Path(filename).suffix.lower() in {".heic", ".heif"}:
        return HEIC_MESSAGE
    return "Only image files are supported (.png, .jpg, .jpeg, .webp, .bmp, .tif, .tiff)"
