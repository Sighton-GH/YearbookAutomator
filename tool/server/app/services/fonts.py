from __future__ import annotations

import mimetypes
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


_BOLD_WORDS = ("bold", "black", "heavy", "semibold", "demibold", "extrabold")
_REGULAR_STYLES = ("regular", "book", "roman", "normal", "medium", "")


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


def _index(paths: list[Path]) -> dict[str, list[tuple[str, Path]]]:
    out: dict[str, list[tuple[str, Path]]] = {}
    for p in paths:
        for family, style in _family_style_keys(p):
            out.setdefault(family.strip().lower(), []).append((style.strip().lower(), p))
    return out


@lru_cache(maxsize=1)
def _system_index() -> dict[str, list[tuple[str, Path]]]:
    paths: list[Path] = []
    for folder in SYSTEM_FONTS_DIRS:
        if folder.exists():
            paths.extend(folder.glob("**/*.ttf"))
            paths.extend(folder.glob("**/*.otf"))
    return _index(paths)


def _pick_style(entries: list[tuple[str, Path]], bold: bool) -> Path | None:
    def is_bold(style: str) -> bool:
        return any(w in style for w in _BOLD_WORDS)

    upright = [(s, p) for s, p in entries if "italic" not in s and "oblique" not in s]
    pool = upright or entries
    if bold:
        for s, p in pool:
            if is_bold(s):
                return p
    for wanted in _REGULAR_STYLES:
        for s, p in pool:
            if s == wanted:
                return p
    non_bold = [p for s, p in pool if not is_bold(s)]
    return (non_bold or [p for _, p in pool] or [None])[0]


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
