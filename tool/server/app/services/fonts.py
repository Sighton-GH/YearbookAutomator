from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List

from fontTools.ttLib import TTFont

from app.services.storage import workspace_dir

SYSTEM_FONTS_DIRS = [
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
    Path.home() / ".local/share/fonts",
    Path("C:/Windows/Fonts"),
    Path("/System/Library/Fonts"),
    Path("/Library/Fonts"),
]


def _font_name_from_file(path: Path) -> str:
    try:
        font = TTFont(str(path))
        names = font['name'].names
        for n in names:
            if n.nameID == 1:
                return str(n.toStr())
    except Exception:
        pass
    return path.stem


def list_system_fonts() -> List[dict]:
    seen = set()
    fonts: List[dict] = []
    for folder in SYSTEM_FONTS_DIRS:
        if not folder.exists():
            continue
        for path in folder.glob("**/*.ttf"):
            if path in seen:
                continue
            seen.add(path)
            fonts.append({"name": _font_name_from_file(path), "filename": str(path), "source": "system"})
        for path in folder.glob("**/*.otf"):
            if path in seen:
                continue
            seen.add(path)
            fonts.append({"name": _font_name_from_file(path), "filename": str(path), "source": "system"})
    return fonts


def list_workspace_fonts(workspace_id: str) -> List[dict]:
    root = workspace_dir(workspace_id) / "fonts"
    if not root.exists():
        return []
    fonts: List[dict] = []
    for path in root.glob("*.*"):
        if path.suffix.lower() not in {".ttf", ".otf"}:
            continue
        fonts.append({"name": _font_name_from_file(path), "filename": path.name, "source": "uploaded"})
    return fonts


def font_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "font/ttf"


@dataclass(frozen=True)
class FontFace:
    path: Path
    style: str
    weight: int
    width: int
    italic: bool
    variable: bool


def _face_metrics(path: Path) -> tuple[int, int, bool, bool]:
    """Read (weight, width, table_italic, variable) from the font tables."""
    weight, width = 400, 5
    table_italic = False
    variable = False
    try:
        font = TTFont(str(path), lazy=True)
        if "OS/2" in font:
            os2 = font["OS/2"]
            try:
                weight = int(os2.usWeightClass)
            except Exception:
                pass
            try:
                width = int(os2.usWidthClass)
            except Exception:
                pass
            try:
                if int(os2.fsSelection) & 1:
                    table_italic = True
            except Exception:
                pass
        if "head" in font:
            try:
                if int(font["head"].macStyle) & 2:
                    table_italic = True
            except Exception:
                pass
        variable = "fvar" in font
    except Exception:
        pass
    return weight, width, table_italic, variable


def _family_style_keys(path: Path) -> list[tuple[str, str]]:
    try:
        font = TTFont(str(path), lazy=True)
        family = subfamily = typo_family = typo_style = ""
        for rec in font["name"].names:
            if rec.nameID == 1 and not family:
                family = str(rec.toStr())
            elif rec.nameID == 2 and not subfamily:
                subfamily = str(rec.toStr())
            elif rec.nameID == 16:  # typographic family wins when present
                typo_family = str(rec.toStr())
            elif rec.nameID == 17:
                typo_style = str(rec.toStr())
        keys: list[tuple[str, str]] = []
        if family or subfamily:
            keys.append((family or path.stem, subfamily))
        elif not typo_family:
            return [(path.stem, "")]
        if typo_family and typo_family.strip().lower() != (family or "").strip().lower():
            keys.append((typo_family, typo_style))
        elif typo_family and (typo_style or "").strip().lower() != (subfamily or "").strip().lower():
            keys.append((typo_family, typo_style))
        return keys or [(path.stem, "")]
    except Exception:
        return [(path.stem, "")]


def _index(paths: list[Path]) -> dict[str, list[FontFace]]:
    out: dict[str, list[FontFace]] = {}
    for p in paths:
        weight, width, table_italic, variable = _face_metrics(p)
        for family, style in _family_style_keys(p):
            normal_style = style.strip().lower()
            italic = table_italic or "italic" in normal_style or "oblique" in normal_style
            out.setdefault(family.strip().lower(), []).append(
                FontFace(path=p, style=normal_style, weight=weight, width=width, italic=italic, variable=variable)
            )
    return out


@lru_cache(maxsize=1)
def _system_index() -> dict[str, list[FontFace]]:
    paths: list[Path] = []
    for folder in SYSTEM_FONTS_DIRS:
        if folder.exists():
            paths.extend(folder.glob("**/*.ttf"))
            paths.extend(folder.glob("**/*.otf"))
    return _index(paths)


_REGULAR_NAME_HINTS = frozenset({"regular", "book", "roman", "normal", "medium", "plain", "text", "r"})
_BOLD_NAME_HINTS = frozenset({"bold", "black", "heavy", "semibold", "demibold", "extrabold", "ultrabold", "b"})


def _pick_style(entries: list[FontFace], bold: bool) -> Path | None:
    if not entries:
        return None
    target = 700 if bold else 400

    def base_score(face: FontFace) -> int:
        return (
            abs(face.weight - target) + 200 * abs(face.width - 5) + 1000 * int(face.italic) + 50 * int(face.variable)
        )

    def name_mismatch(face: FontFace) -> int:
        # Tie-break when metrics cannot tell faces apart (e.g. this machine's
        # Ubuntu files are byte-identical variable fonts all reporting weight
        # 400 / width 5): prefer the conventionally named Regular/Bold file.
        # 0 when the filename suggests the requested class, else 1.
        tokens = [t for t in "".join(ch if ch.isalnum() else " " for ch in face.path.stem.lower()).split() if t]
        if bold:
            return 0 if tokens and tokens[-1] in _BOLD_NAME_HINTS else 1
        return 0 if tokens and tokens[-1] in _REGULAR_NAME_HINTS else 1

    def score(face: FontFace) -> tuple[int, int, int, str]:
        return (base_score(face), name_mismatch(face), len(face.path.name), str(face.path))

    return min(entries, key=score).path


def resolve_font_file(workspace_id: str, family: str, bold: bool) -> Path | None:
    key = (family or "").strip().strip('"').strip("'").lower()
    if not key:
        return None
    fonts_root = workspace_dir(workspace_id) / "fonts"
    uploaded = [p for p in fonts_root.glob("*.*") if p.suffix.lower() in {".ttf", ".otf"}] if fonts_root.exists() else []
    for index in (_index(uploaded), _system_index()):
        entries = index.get(key)
        if entries:
            return _pick_style(entries, bold)
    return None
