"""F1.7 Unicode run plans shared by text fitting and painting.

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


@lru_cache(maxsize=32)
def font_coverage(path: str) -> frozenset[int]:
    try:
        with TTFont(path, lazy=True) as font:
            return frozenset((font.getBestCmap() or {}).keys())
    except Exception:
        return frozenset()


@lru_cache(maxsize=4096)
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
    # Stop at the first covering face. Eager scans of every installed font
    # exceed the coverage cache and reparse thousands of cmaps per fit size.
    if prefer_color:
        for path in paths:
            if color_font(path) and codepoint in font_coverage(path):
                return path
    return next((path for path in paths if codepoint in font_coverage(path)), None)


@lru_cache(maxsize=512)
def covering_paths(codepoint: int, paths: tuple[str, ...], prefer_color: bool = False) -> tuple[str, ...]:
    """Retain tiny path results, not whole cmaps, across all fitting sizes."""
    covered = [path for path in paths if codepoint in font_coverage(path)]
    if prefer_color:
        covered.sort(key=lambda path: not color_font(path))
    return tuple(covered)


@lru_cache(maxsize=128)
def usable_fallback(codepoint: int, size: int, paths: tuple[str, ...], prefer_color: bool = False):
    """Cache success and failure so unsupported bitmap strikes are not rescanned."""
    for path in covering_paths(codepoint, paths, prefer_color):
        try:
            return ImageFont.truetype(path, size), color_font(path)
        except (OSError, ValueError):
            continue
    return None


def clear_glyph_caches():
    """Call after font uploads/removals or changes to installed fonts."""
    font_coverage.cache_clear()
    color_font.cache_clear()
    fallback_path.cache_clear()
    usable_fallback.cache_clear()
    covering_paths.cache_clear()


def script_kwargs(text: str, language: str | None = None,
                  warnings: list[str] | None = None) -> dict:
    # Paragraph direction follows the first strong character, not an RTL word
    # embedded in an otherwise left-to-right paragraph.
    strong = next((unicodedata.bidirectional(c) for c in text
                   if unicodedata.bidirectional(c) in {'L', 'R', 'AL'}), 'L')
    rtl = strong in {'R', 'AL'}
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
    for char in text:
        chosen, embedded, shown = primary, color_font(str(primary.path)) if hasattr(primary, 'path') else False, char
        # Formatting controls and variation selectors must stay with shaped runs.
        invisible = unicodedata.category(char) == 'Cf' or 0xFE00 <= ord(char) <= 0xFE0F
        wants_color = _emoji(char) and not embedded and any(
            color_font(p) and ord(char) in font_coverage(p) for p in paths)
        if (ord(char) not in coverage or wants_color) and not char.isspace() and not invisible:
            fallback = usable_fallback(ord(char), size, paths, _emoji(char))
            chosen = None
            if fallback is not None:
                chosen, embedded = fallback
            if chosen is None and ord(char) in coverage:
                chosen = primary
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


class UnicodeDraw:
    """A shared run plan for ink measurement and drawing, at primary baselines.

    Single-face text goes straight to Pillow, retaining kerning/shaping. Mixed
    faces share the primary ascender rather than each face's top anchor.
    """
    def __init__(self, draw, warnings=None, paths=None, language=None):
        self.draw = draw
        self.language = language
        self.warnings = warnings
        self.paths = system_font_paths() if paths is None else paths
        self._plans = {}

    def plan(self, text, font):
        key = (text, font)
        if key not in self._plans:
            runs = glyph_runs(text, font, getattr(font, 'size', 16),
                              paths=self.paths, warnings=self.warnings)
            kwargs = script_kwargs(text, self.language, warnings=self.warnings)
            if len(runs) > 1 and kwargs.get('direction') == 'rtl':
                append_once(self.warnings, 'Mixed-font right-to-left text may have incorrect ordering. Please check the real rendering preview.')
                runs.reverse()
            self._plans[key] = runs, kwargs
        return self._plans[key]

    def needs_layout(self, text, font):
        runs, kwargs = self.plan(text, font)
        return bool(kwargs or len(runs) != 1 or runs[0].font is not font
                    or runs[0].text != text or runs[0].embedded_color)

    def _bounds(self, text, font, stroke_width=0):
        runs, kwargs = self.plan(text, font)
        if len(runs) == 1 and runs[0].font is font:
            return self.draw.textbbox((0, 0), runs[0].text, font=font,
                                      stroke_width=stroke_width, **kwargs)
        ascent = font.getmetrics()[0] if hasattr(font, 'getmetrics') else 0
        x, bounds = 0.0, []
        for run in runs:
            bounds.append(self.draw.textbbox((x, ascent), run.text, font=run.font,
                                             anchor='ls', stroke_width=stroke_width, **kwargs))
            x += run.font.getlength(run.text, **kwargs)
        if not bounds:
            return (0, 0, 0, 0)
        return (min(b[0] for b in bounds), min(b[1] for b in bounds),
                max(b[2] for b in bounds), max(b[3] for b in bounds))

    def textbbox(self, xy, text, font, **kwargs):
        b = self._bounds(text, font, kwargs.get('stroke_width', 0))
        return (b[0] + xy[0], b[1] + xy[1], b[2] + xy[0], b[3] + xy[1])

    def text(self, xy, text, font, fill, anchor='la', **options):
        runs, kwargs = self.plan(text, font)
        if len(runs) == 1 and runs[0].font is font:
            return self.draw.text(xy, runs[0].text, font=font, fill=fill,
                                  anchor=anchor, embedded_color=runs[0].embedded_color,
                                  **options, **kwargs)
        advances = [run.font.getlength(run.text, **kwargs) for run in runs]
        x, y = xy
        if anchor == 'ma':
            x -= sum(advances) / 2
        elif anchor == 'ra':
            x -= sum(advances)
        ascent = font.getmetrics()[0] if hasattr(font, 'getmetrics') else 0
        for run, advance in zip(runs, advances):
            self.draw.text((x, y + ascent), run.text, font=run.font, fill=fill,
                           anchor='ls', embedded_color=run.embedded_color,
                           **options, **kwargs)
            x += advance

    def draw_tracked(self, xy, text, font, spacing, *, fill, anchor='la', **kwargs):
        # Tracking separates glyphs by definition. Warn on scripts requiring
        # contextual shaping rather than silently presenting correct-looking fit.
        if any(unicodedata.combining(c) or unicodedata.bidirectional(c) in {'R', 'AL'} for c in text):
            append_once(self.warnings, 'Letter spacing splits complex-script shaping. Please check the real rendering preview.')
        positions, x = [], 0.0
        for char in text:
            positions.append((char, x))
            runs, script = self.plan(char, font)
            x += sum(r.font.getlength(r.text, **script) for r in runs) + spacing
        left, _, right, _ = self.tracked_bounds(text, font, spacing, positions)
        px, py = xy
        if anchor == 'ma':
            px -= (left + right) / 2
        elif anchor == 'ra':
            px -= right
        for char, dx in positions:
            self.text((px + dx, py), char, font, fill, **kwargs)

    def tracked_bounds(self, text, font, spacing, positions=None):
        if positions is None:
            positions, x = [], 0.0
            for char in text:
                positions.append((char, x))
                runs, script = self.plan(char, font)
                x += sum(r.font.getlength(r.text, **script) for r in runs) + spacing
        bounds = [self.textbbox((x, 0), char, font) for char, x in positions]
        return (min(b[0] for b in bounds), min(b[1] for b in bounds),
                max(b[2] for b in bounds), max(b[3] for b in bounds)) if bounds else (0, 0, 0, 0)
