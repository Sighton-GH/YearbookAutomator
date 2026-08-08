from __future__ import annotations

import io
import os
import warnings
import zipfile
from pathlib import Path

from PIL import Image


class UnsafeUpload(ValueError):
    pass


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default)) or default))
    except (TypeError, ValueError):
        return default


def max_request_bytes() -> int:
    return _env_int("YMGA_MAX_REQUEST_BYTES", 512 * 1024 * 1024)


def validate_image_bytes(data: bytes, *, label: str = "image") -> tuple[int, int, str]:
    """Validate image structure and decoded dimensions before expensive processing."""
    if not data:
        raise UnsafeUpload(f"{label} is empty")
    max_file = _env_int("YMGA_MAX_IMAGE_BYTES", 100 * 1024 * 1024)
    if len(data) > max_file:
        raise UnsafeUpload(f"{label} exceeds the {max_file // (1024 * 1024)} MiB image limit")

    max_pixels = _env_int("YMGA_MAX_IMAGE_PIXELS", 80_000_000)
    max_dimension = _env_int("YMGA_MAX_IMAGE_DIMENSION", 20_000)
    allowed_formats = {"PNG", "JPEG", "WEBP", "BMP", "TIFF"}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                image_format = str(image.format or "").upper()
                if image_format not in allowed_formats:
                    raise UnsafeUpload(f"{label} has an unsupported image format")
                if width <= 0 or height <= 0 or width > max_dimension or height > max_dimension:
                    raise UnsafeUpload(f"{label} dimensions are outside the allowed range")
                if width * height > max_pixels:
                    raise UnsafeUpload(f"{label} exceeds the {max_pixels:,}-pixel limit")
                image.verify()
    except UnsafeUpload:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise UnsafeUpload(f"{label} is too large to decode safely") from None
    except Exception:
        raise UnsafeUpload(f"{label} is not a valid supported image") from None
    return width, height, image_format


def validate_zip_archive(
    zf: zipfile.ZipFile,
    *,
    label: str = "ZIP archive",
    max_members: int | None = None,
    max_member_bytes: int | None = None,
    max_total_bytes: int | None = None,
    max_ratio: int | None = None,
) -> list[zipfile.ZipInfo]:
    """Reject encrypted, oversized, or highly compressed archives before extraction."""
    max_members = max_members or _env_int("YMGA_MAX_ARCHIVE_FILES", 2_000)
    max_member_bytes = max_member_bytes or _env_int("YMGA_MAX_ARCHIVE_MEMBER_BYTES", 100 * 1024 * 1024)
    max_total_bytes = max_total_bytes or _env_int("YMGA_MAX_ARCHIVE_UNCOMPRESSED_BYTES", 2 * 1024 * 1024 * 1024)
    max_ratio = max_ratio or _env_int("YMGA_MAX_ARCHIVE_COMPRESSION_RATIO", 250)

    members = [info for info in zf.infolist() if not info.is_dir()]
    if len(members) > max_members:
        raise UnsafeUpload(f"{label} contains more than {max_members} files")

    total = 0
    for info in members:
        if info.flag_bits & 0x1:
            raise UnsafeUpload(f"{label} contains encrypted files")
        if info.file_size < 0 or info.file_size > max_member_bytes:
            raise UnsafeUpload(
                f"{label} member '{Path(info.filename).name}' exceeds the "
                f"{max_member_bytes // (1024 * 1024)} MiB per-file limit"
            )
        total += int(info.file_size)
        if total > max_total_bytes:
            raise UnsafeUpload(
                f"{label} expands beyond the {max_total_bytes // (1024 * 1024)} MiB archive limit"
            )
        if info.file_size > 1024 * 1024:
            ratio = info.file_size / max(1, info.compress_size)
            if ratio > max_ratio:
                raise UnsafeUpload(f"{label} contains a suspiciously compressed file")
    return members


def validate_spreadsheet_bytes(data: bytes, filename: str, *, label: str = "Spreadsheet") -> None:
    """Bound CSV/XLSX parsing, including the ZIP container inside XLSX files."""
    max_file = _env_int("YMGA_MAX_SPREADSHEET_BYTES", 25 * 1024 * 1024)
    if not data:
        raise UnsafeUpload(f"{label} is empty")
    if len(data) > max_file:
        raise UnsafeUpload(f"{label} exceeds the {max_file // (1024 * 1024)} MiB limit")
    suffix = Path(filename or "").suffix.lower()
    if suffix not in {".csv", ".xlsx"}:
        raise UnsafeUpload(f"{label} must be CSV or XLSX")
    if suffix == ".csv":
        if b"\x00" in data[:1_000_000]:
            raise UnsafeUpload(f"{label} is not a valid text CSV")
        return
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise UnsafeUpload(f"{label} is not a valid XLSX workbook")
            validate_zip_archive(
                zf,
                label=f"{label} XLSX container",
                max_members=1_000,
                max_member_bytes=50 * 1024 * 1024,
                max_total_bytes=200 * 1024 * 1024,
                max_ratio=100,
            )
    except UnsafeUpload:
        raise
    except zipfile.BadZipFile:
        raise UnsafeUpload(f"{label} is not a valid XLSX workbook") from None


def read_zip_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    max_member_bytes = _env_int("YMGA_MAX_ARCHIVE_MEMBER_BYTES", 100 * 1024 * 1024)
    with zf.open(info) as source:
        data = source.read(max_member_bytes + 1)
    if len(data) > max_member_bytes:
        raise UnsafeUpload("Archive member exceeds the configured per-file limit")
    return data
