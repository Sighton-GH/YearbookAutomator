from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Box(BaseModel):
    x: int
    y: int
    width: int
    height: int


class TemplateSlots(BaseModel):
    mugshot: Box
    baby_photo: Box
    name: Box
    quote: Box


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


class TemplateParseResponse(BaseModel):
    template_id: str
    width: int
    height: int
    slots: list[TemplateSlots]
    raw_debug: Optional[RawParseDebug] = None


class PersonRecord(BaseModel):
    index: int
    first_name: str
    last_name: str
    mugshot_filename: Optional[str] = None
    quote: Optional[str] = None
    baby_photo_filename: Optional[str] = None


class SpreadsheetPreview(BaseModel):
    workspace_id: str
    people: list[PersonRecord]
    warnings: list[str] = Field(default_factory=list)


class MappingDecision(BaseModel):
    person_index: int
    action: Literal["keep", "replace", "shift", "shift_up", "skip", "remove"]
    replacement_mugshot: Optional[str] = None


class MappingRequest(BaseModel):
    workspace_id: str
    people: list[PersonRecord]
    decisions: list[MappingDecision]


class GenerationRequest(BaseModel):
    workspace_id: str
    template_id: str
    slots: list[TemplateSlots]
    people: list[PersonRecord]
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
        description="Optional output filename (e.g. preview.png). Defaults to output.png",
    )

    output_width: Optional[int] = Field(
        default=None,
        description="Optional output width in pixels. If provided, output is downscaled (never upscaled) and aspect ratio is locked to the template.",
    )
    output_height: Optional[int] = Field(
        default=None,
        description="Optional output height in pixels. If provided, output is downscaled (never upscaled) and aspect ratio is locked to the template.",
    )

    # Styling (legacy single-style fields)
    default_quote: Optional[str] = None
    default_baby_photo_filename: Optional[str] = None
    default_mugshot_filename: Optional[str] = None
    font_family: str = Field(..., description="Font family for text rendering")
    font_weight: str = Field("normal", description="Font weight, e.g. normal or bold")
    all_caps: bool = False
    align: Literal["left", "center"] = "left"

    # Styling (preferred: separate name/quote styles)
    name_font_family: Optional[str] = None
    name_font_weight: Optional[str] = None
    name_font_size: int = Field(40, description="Name font size in points")
    name_all_caps: Optional[bool] = None
    name_align: Optional[Literal["left", "center"]] = None

    quote_font_family: Optional[str] = None
    quote_font_weight: Optional[str] = None
    quote_font_size: int = Field(40, description="Quote font size in points")
    quote_all_caps: Optional[bool] = None
    quote_align: Optional[Literal["left", "center"]] = None

    # Baby photo rendering
    baby_background_color: Optional[str] = Field(
        default=None,
        description="Optional hex colour (e.g. #ffffff). If provided and a baby photo has transparency, transparent pixels are filled with this colour before pasting.",
    )

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
        description="Optional mapping of person_index -> slot_number (1-based within spread).",
    )
