from __future__ import annotations

import mimetypes
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
