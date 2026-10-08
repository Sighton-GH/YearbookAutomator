"""F1.7 Unicode capability helpers. Not automatically wired into text_layout.

Use whole shaped runs where possible. Per-character fallback cannot guarantee
complex-script shaping; warnings make that limitation explicit.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import unicodedata

from fontTools.ttLib import TTFont
from PIL import ImageFont, ImageDraw, features

from app.services import fonts
from app.services.name_fitting import append_once


@lru_cache(maxsize=512)
def font_coverage(path: str) -> frozenset[int]:
    try:
        with TTFont(path, lazy=True) as font:
            return frozenset((font.getBestCmap() or {}).keys())
    except Exception:
        return frozenset()


@lru_cache(maxsize=512)
def color_font(path: str) -> bool:
    try:
        with TTFont(path, lazy=True) as font:
            return 'CBDT' in font or 'COLR' in font
    except Exception:
        return False


def system_font_paths() -> tuple[str, ...]:
    return tuple(sorted({str(face.path) for faces in fonts._system_index().values() for face in faces}))


@lru_cache(maxsize=4096)
def fallback_path(codepoint: int, paths: tuple[str, ...], prefer_color: bool = False) -> str | None:
    candidates = [p for p in paths if codepoint in font_coverage(p)]
    if prefer_color:
        candidates.sort(key=lambda p: not color_font(p))
    return candidates[0] if candidates else None


def clear_glyph_caches():
    """Call after font uploads/removals or changes to installed fonts."""
    font_coverage.cache_clear()
    color_font.cache_clear()
    fallback_path.cache_clear()


def script_kwargs(text: str, language: str | None = None,
                  warnings: list[str] | None = None) -> dict:
    rtl = any(unicodedata.bidirectional(c) in {'R', 'AL', 'AN'} for c in text)
    if not rtl:
        return {'language': language} if language and features.check('raqm') else {}
    if not features.check('raqm'):
        append_once(warnings, 'Right-to-left text may render incorrectly because this installation lacks RTL shaping support.')
        return {}
    return {'direction': 'rtl', **({'language': language} if language else {})}


def _emoji(char):
    return 0x1F000 <= ord(char) <= 0x1FAFF or 0x2600 <= ord(char) <= 0x27BF


@dataclass(frozen=True)
class GlyphRun:
    text: str
    font: object
    embedded_color: bool = False


def glyph_runs(text: str, primary, size: int, *, paths: tuple[str, ...] | None = None,
               warnings: list[str] | None = None) -> list[GlyphRun]:
    """Split by usable font; never raise for invalid/missing Unicode glyphs.

    Bitmap-only colour fonts often cannot load at arbitrary sizes. Try another
    covering face rather than scaling an unverified strike. Missing glyphs
    become '?' with a warning, not silently a square. Preserve whitespace.
    """
    paths = system_font_paths() if paths is None else paths
    coverage = font_coverage(str(primary.path)) if hasattr(primary, 'path') else frozenset()
    runs = []
    loaded = {}
    for char in text:
        chosen, embedded, shown = primary, False, char
        if ord(char) not in coverage and not char.isspace():
            path = fallback_path(ord(char), paths, _emoji(char))
            ordered = ([path] if path else []) + [p for p in paths if p != path and ord(char) in font_coverage(p)]
            chosen = None
            for p in ordered:
                try:
                    if p not in loaded:
                        loaded[p] = ImageFont.truetype(p, size)
                    chosen, embedded = loaded[p], color_font(p)
                    break
                except (OSError, ValueError):
                    continue
            if chosen is None:
                chosen, shown = primary, '?'
                append_once(warnings, f'A glyph (U+{ord(char):04X}) is unavailable in installed fonts. A question mark was used.')
        if _emoji(char) and not embedded:
            append_once(warnings, 'Colour emoji is unavailable for this text size. A monochrome glyph or question mark was used.')
        if runs and runs[-1].font is chosen and runs[-1].embedded_color == embedded:
            previous = runs.pop()
            runs.append(GlyphRun(previous.text + shown, chosen, embedded))
        else:
            runs.append(GlyphRun(shown, chosen, embedded))
    if len(runs) > 1 and any(unicodedata.bidirectional(c) in {'R', 'AL'} or unicodedata.combining(c) for c in text):
        append_once(warnings, 'Font fallback splits a complex-script text run. Please check the real rendering preview for shaping errors.')
    return runs


def draw_unicode(draw: ImageDraw.ImageDraw, xy, text, font, size: int, *,
                 fill=(20, 30, 50), paths=None, language=None, warnings=None):
    """Left/top run drawer; returns total advance. RTL multi-font order is partial.

    Integrator must use the same runs for measuring, wrapping and drawing.
    Do not replace just the final draw call in text_layout: fitting would diverge.
    """
    runs = glyph_runs(text, font, size, paths=paths, warnings=warnings)
    kwargs = script_kwargs(text, language, warnings)
    if len(runs) > 1 and kwargs.get('direction') == 'rtl':
        append_once(warnings, 'Mixed-font right-to-left text may have incorrect ordering. Please check the real rendering preview.')
    x, y = xy
    for run in runs:
        try:
            draw.text((x, y), run.text, font=run.font, fill=fill, anchor='la',
                      embedded_color=run.embedded_color, **kwargs)
            x += run.font.getlength(run.text, **kwargs)
        except (UnicodeError, OSError, ValueError, TypeError):
            append_once(warnings, 'Some Unicode text could not be rendered. A question mark was used.')
            try:
                draw.text((x, y), '?', font=font, fill=fill)
                x += font.getlength('?')
            except (UnicodeError, OSError, ValueError, TypeError):
                pass
    return x - xy[0]
