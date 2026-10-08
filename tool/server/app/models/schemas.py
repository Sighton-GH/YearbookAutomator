from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class Box(BaseModel):
    x: int = Field(ge=-100_000, le=100_000)
    y: int = Field(ge=-100_000, le=100_000)
    width: int = Field(ge=1, le=50_000)
    height: int = Field(ge=1, le=50_000)


class TemplateDetectionOptions(BaseModel):
    tolerance: int | None = Field(default=None, ge=0, le=64)


class TemplateSlots(BaseModel):
    mugshot: Box
    baby_photo: Box
    name: Box
    quote: Box
    baby_shape: Literal["auto", "rectangle", "ellipse", "rounded"] | None = None


class BabyMaskRequest(BaseModel):
    workspace_id: str
    box: Box
    baby_shape: Literal["auto", "rectangle", "ellipse", "rounded"] = "auto"


class RawParseDebug(BaseModel):
    """Debug info showing raw detected boxes before grouping."""
    mugshot_count: int
    baby_count: int
    name_count: int
    quote_count: int
    mugshots: list[Box]
    baby_photos: list[Box]
    names: list[Box]
    quotes: list[Box]
    # Keys match slot fields. Coordinates use the clean-template pixel space.
    dropped: dict[str, list[Box]] = Field(default_factory=dict)
    invented: dict[str, list[Box]] = Field(default_factory=dict)
    messages: list[str] = Field(default_factory=list)


class TemplateParseResponse(BaseModel):
    template_id: str
    width: int
    height: int
    slots: list[TemplateSlots]
    raw_debug: Optional[RawParseDebug] = None


class PhotoShadow(BaseModel):
    color: str = Field(default="#000000", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    opacity: float = Field(default=0.4, ge=0, le=1)
    offset_x: int = Field(default=4, ge=-500, le=500)
    offset_y: int = Field(default=4, ge=-500, le=500)
    blur: int = Field(default=6, ge=0, le=100)


class PhotoFocus(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    zoom: float = Field(default=1, ge=1, le=4)


class PersonRecord(BaseModel):
    index: int = Field(ge=1, le=100_000)
    first_name: str = Field(max_length=200)
    last_name: str = Field(max_length=200)
    mugshot_filename: Optional[str] = Field(default=None, max_length=180)
    quote: Optional[str] = Field(default=None, max_length=2_000)
    original_first_name: str | None = Field(default=None, max_length=200)
    original_last_name: str | None = Field(default=None, max_length=200)
    quote_blank: bool = False
    added_manually: bool = False
    excluded: bool = False
    name_font_size: int | None = Field(default=None, ge=1, le=500)
    quote_font_size: int | None = Field(default=None, ge=1, le=500)
    name_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    quote_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    hide_baby_photo: bool | None = None
    baby_photo_filename: Optional[str] = Field(default=None, max_length=180)
    baby_background_removal_failed: bool = False


class FilenameColumnCandidate(BaseModel):
    column: str
    listed: int
    found: int
    suggested: bool = False


class SpreadsheetPreview(BaseModel):
    workspace_id: str
    people: list[PersonRecord]
    warnings: list[str] = Field(default_factory=list)
    filename_column_candidates: list[FilenameColumnCandidate] = Field(default_factory=list)


_HEX_COLOUR_RE = re.compile(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")


def _check_hex_colour(value: Optional[str], label: str) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if _HEX_COLOUR_RE.fullmatch(text):
        return text
    raise ValueError(f"{label} must be a hex colour like #141e32")


class TextShadowSpec(BaseModel):
    offset_x: int = Field(default=0, ge=-200, le=200)
    offset_y: int = Field(default=0, ge=-200, le=200)
    blur: int = Field(default=0, ge=0, le=20)
    color: str = "#000000"
    opacity: float = Field(default=1.0, ge=0, le=1)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str) -> str:
        checked = _check_hex_colour(value, "Shadow colour")
        if checked is None:
            raise ValueError("Shadow colour must be a hex colour like #000000")
        return checked



class MappingDecision(BaseModel):
    person_index: int
    action: Literal["keep", "replace", "shift", "shift_up", "skip", "remove"]
    replacement_mugshot: Optional[str] = Field(default=None, max_length=180)


class MappingRequest(BaseModel):
    workspace_id: str
    people: list[PersonRecord] = Field(max_length=2_000)
    decisions: list[MappingDecision] = Field(max_length=2_000)


class GenerationRequest(BaseModel):
    workspace_id: str
    template_id: str
    slots: list[TemplateSlots] = Field(max_length=2_000)
    people: list[PersonRecord] = Field(max_length=2_000)
    output_format: Literal["png", "pdf", "tiff"] = Field(
        default="png",
        description="Output format for rendered spreads. Default is png.",
    )
    count_usage: bool = Field(
        default=False,
        description="If true, this generation counts against license usage limits (used for the Render All action).",
    )
    output_filename: Optional[str] = Field(
        default=None,
        max_length=180,
        description="Optional output filename (e.g. preview.png). Defaults to output.png",
    )

    output_width: Optional[int] = Field(
        default=None,
        ge=1,
        le=50_000,
        description="Optional output width in pixels. If provided, output is downscaled (never upscaled) and aspect ratio is locked to the template.",
    )
    output_height: Optional[int] = Field(
        default=None,
        ge=1,
        le=50_000,
        description="Optional output height in pixels. If provided, output is downscaled (never upscaled) and aspect ratio is locked to the template.",
    )

    # Styling (legacy single-style fields)
    default_quote: Optional[str] = Field(default=None, max_length=2_000)
    default_baby_photo_filename: Optional[str] = Field(default=None, max_length=180)
    default_mugshot_filename: Optional[str] = Field(default=None, max_length=180)
    font_family: str = Field(..., max_length=300, description="Font family for text rendering")
    font_weight: str = Field("normal", max_length=30, description="Font weight, e.g. normal or bold")
    all_caps: bool = False
    align: Literal["left", "center"] = "left"

    # Styling (preferred: separate name/quote styles)
    name_font_family: Optional[str] = Field(default=None, max_length=300)
    name_font_weight: Optional[str] = Field(default=None, max_length=30)
    name_font_size: int = Field(40, ge=1, le=500, description="Name font size in points")
    name_all_caps: Optional[bool] = None
    name_align: Optional[Literal["left", "center", "right"]] = None
    name_color: Optional[str] = Field(default=None, description="Text colour, hex. Null keeps the built-in #141e32.")
    name_valign: Optional[Literal["top", "middle", "bottom"]] = None
    name_line_spacing: Optional[float] = Field(default=None, ge=0.5, le=3.0)
    name_letter_spacing: int = Field(default=0, ge=-5, le=50)
    name_stroke_width: int = Field(default=0, ge=0, le=20)
    name_stroke_color: Optional[str] = None
    name_shadow: Optional[TextShadowSpec] = None
    name_font_style: Literal["normal", "italic"] = "normal"
    name_min_size: int = Field(default=8, ge=6, le=200)
    name_fit: Literal["shrink", "wrap"] = "shrink"

    quote_font_family: Optional[str] = Field(default=None, max_length=300)
    quote_font_weight: Optional[str] = Field(default=None, max_length=30)
    quote_font_size: int = Field(40, ge=1, le=500, description="Quote font size in points")
    quote_all_caps: Optional[bool] = None
    quote_align: Optional[Literal["left", "center", "right", "justify"]] = None
    quote_color: Optional[str] = Field(default=None, description="Text colour, hex. Null keeps the built-in #141e32.")
    quote_valign: Optional[Literal["top", "middle", "bottom"]] = None
    quote_line_spacing: Optional[float] = Field(default=None, ge=0.5, le=3.0)
    quote_letter_spacing: int = Field(default=0, ge=-5, le=50)
    quote_stroke_width: int = Field(default=0, ge=0, le=20)
    quote_stroke_color: Optional[str] = None
    quote_shadow: Optional[TextShadowSpec] = None
    quote_font_style: Literal["normal", "italic"] = "normal"
    quote_min_size: int = Field(default=8, ge=6, le=200)

    @field_validator("name_color", "quote_color")
    @classmethod
    def _validate_text_color(cls, value: Optional[str]) -> Optional[str]:
        return _check_hex_colour(value, "Text colour")

    @field_validator("name_stroke_color", "quote_stroke_color")
    @classmethod
    def _validate_stroke_color(cls, value: Optional[str]) -> Optional[str]:
        return _check_hex_colour(value, "Outline colour")

    mugshot_fit: Literal["cover", "contain"] = "cover"
    mugshot_face_aware: bool = False
    mugshot_shape: Literal["rect", "rounded", "ellipse"] = "rect"
    mugshot_corner_radius: int = Field(default=0, ge=0, le=500)
    mugshot_border_width: int = Field(default=0, ge=0, le=100)
    mugshot_border_color: str = Field(default="#ffffff", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    mugshot_shadow: Optional[PhotoShadow] = None
    baby_shape: Literal["rect", "rounded", "ellipse"] = "rect"
    baby_corner_radius: int = Field(default=0, ge=0, le=500)
    baby_border_width: int = Field(default=0, ge=0, le=100)
    baby_border_color: str = Field(default="#ffffff", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    baby_shadow: Optional[PhotoShadow] = None
    contain_fill_color: str = Field(default="#ffffff", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

    # Baby photo rendering
    baby_background_color: Optional[str] = Field(
        default=None,
        description="Optional hex colour (e.g. #ffffff). If provided and a baby photo has transparency, transparent pixels are filled with this colour before pasting.",
    )

    @field_validator("baby_background_color")
    @classmethod
    def _validate_baby_background_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = value.strip()
        if not text:
            return None
        if re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", text):
            return text
        raise ValueError("Baby photo background colour must be a hex colour like #ffffff")

    center_baby_on_face: bool = Field(
        default=False,
        description="If true, attempts to detect a face in each baby photo and center the crop on it when fitting into the baby cutout.",
    )

    # Placement controls (optional; keeps backwards compatibility with clients that
    # precompute per-person slots and just want zip(people, slots)).
    auto_place: bool = Field(
        default=False,
        description="If true, the server will compute person->slot mapping in reading order.",
    )
    placement_mode: Literal["left_then_right", "simultaneous"] = Field(
        default="left_then_right",
        description="How slots are numbered for auto placement.",
    )
    force_alphabetical: bool = Field(
        default=False,
        description="If true, sorts people by last name before placement.",
    )
    slot_assignments: dict[int, int] = Field(
        default_factory=dict,
        max_length=2_000,
        description="Optional mapping of person_index -> slot_number (1-based within spread).",
    )
