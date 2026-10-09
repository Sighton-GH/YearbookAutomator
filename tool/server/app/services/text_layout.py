"""Opt-in F1 text renderer. Existing generator callers remain unchanged.

The default path delegates to the base renderer to retain its exact pixels.
Coordinates and effects are in output pixels. Callers own request validation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal

from PIL import Image, ImageDraw, ImageFont

from app.services.glyph_fallback import UnicodeDraw
from app.services.text_color import parse_text_color
from app.services.text_spacing import draw_tracked, tracked_bounds
from app.services.text_effects import TextShadow, composite_text
from app.services.name_fitting import append_once, fitting_warning

FontLoader = Callable[[int], ImageFont.ImageFont]


@dataclass(frozen=True)
class TextStyle:
    align: Literal['left', 'center', 'right', 'justify'] = 'left'
    valign: Literal['top', 'middle', 'bottom'] = 'top'
    color: str = '#141e32'
    line_spacing: float | None = None
    letter_spacing: int = 0
    stroke_width: int = 0
    stroke_color: str = '#ffffff'
    shadow: TextShadow | None = None
    name_fit: Literal['shrink', 'wrap'] = 'shrink'
    language: str | None = None


@dataclass(frozen=True)
class TextResult:
    size: int | None
    lines: tuple[str, ...]
    overflow: bool = False


def _width(draw, text, font, style):
    bbox = (tracked_bounds(draw, text, font, style.letter_spacing)
            if style.letter_spacing else draw.textbbox((0, 0), text, font=font))
    return float(bbox[2] - bbox[0])


def _wrap(draw, text, font, width, style):
    # Match base whitespace folding and hard-break overlong words.
    lines, current = [], ''
    for word in text.split():
        trial = f'{current} {word}' if current else word
        if _width(draw, trial, font, style) <= width:
            current = trial
            continue
        if current:
            lines.append(current)
            current = ''
        if _width(draw, word, font, style) > width:
            chunk = ''
            for char in word:
                if chunk and _width(draw, chunk + char, font, style) > width:
                    lines.append(chunk)
                    chunk = ''
                chunk += char
            if chunk:
                lines.append(chunk)
        else:
            current = word
    if current:
        lines.append(current)
    return lines


def _line_step(draw, font, size, style):
    # Pillow multiline_text uses the bottom of the 'A' bbox + spacing.
    if style.line_spacing is not None:
        return size * style.line_spacing
    return draw.textbbox((0, 0), 'A', font=font)[3]


def _fit(draw, text, load_font, start_size, min_size, width, height, kind, style):
    for size in range(max(start_size, min_size), min_size - 1, -1):
        font = load_font(size)
        lines = ([text] if kind == 'name' and style.name_fit == 'shrink'
                 else _wrap(draw, text, font, width, style))
        too_many_lines = kind == 'name' and len(lines) > 2
        if too_many_lines:
            # Keep all content, even when the minimum cannot fit two lines.
            lines = [lines[0], ' '.join(lines[1:])]
        step = _line_step(draw, font, size, style)
        bounds = []
        for i, line in enumerate(lines):
            b = (tracked_bounds(draw, line, font, style.letter_spacing)
                 if style.letter_spacing else draw.textbbox((0, 0), line, font=font))
            bounds.append((b[0], b[1] + i * step, b[2], b[3] + i * step))
        ink_height = max(b[3] for b in bounds) - min(b[1] for b in bounds)
        fits = (not too_many_lines
                and all(_width(draw, line, font, style) <= width for line in lines)
                and (ink_height <= height or (kind == 'name' and style.name_fit == 'shrink'
                                              and style.valign == 'top')))
        if fits or size == min_size:
            return font, size, lines, step, bounds, not fits
    raise AssertionError('unreachable')


def _draw_line(draw, xy, text, font, style, width, justify):
    x, y = xy
    if justify and len(text.split()) > 1:
        words = text.split()
        gap = (width - sum(_width(draw, word, font, style) for word in words)) / (len(words) - 1)
        for word in words:
            draw_tracked(draw, (x, y), word, font, style.letter_spacing, fill=parse_text_color(style.color), anchor='la',
                         stroke_width=style.stroke_width, stroke_fill=parse_text_color(style.stroke_color))
            x += _width(draw, word, font, style) + gap
    else:
        if style.align == 'center':
            x += width / 2
            anchor = 'ma'
        elif style.align == 'right':
            x += width
            anchor = 'ra'
        else:
            anchor = 'la'
        draw_tracked(draw, (x, y), text, font, style.letter_spacing, fill=parse_text_color(style.color), anchor=anchor,
                     stroke_width=style.stroke_width, stroke_fill=parse_text_color(style.stroke_color))


def render_text(image: Image.Image, *, text: str, box, load_font: FontLoader,
                start_size: int, kind: Literal['name', 'quote'],
                style: TextStyle = TextStyle(), all_caps: bool = False,
                min_size: int = 8, max_width: int | None = None,
                max_height: int | None = None, warnings: list[str] | None = None,
                student: str = '') -> TextResult:
    """Mutate RGB/RGBA image; box exposes x/y/width/height. Return fit metadata.

    For quotes pass min(quote.width, mugshot.width*1.5) and mugshot.height.
    warnings is reserved for announced fallbacks in later feature helpers.
    """
    if style.name_fit not in {'shrink', 'wrap'}:
        raise ValueError('Name fit must be shrink or wrap')
    if not 6 <= min_size <= 200:
        raise ValueError('Minimum size must be 6-200')
    if not 0 <= style.stroke_width <= 20:
        raise ValueError('Stroke width must be 0-20 pixels')
    parse_text_color(style.stroke_color)
    if not -5 <= style.letter_spacing <= 50:
        raise ValueError('Letter spacing must be -5 to 50 pixels')
    if style.line_spacing is not None and not 0.5 <= style.line_spacing <= 3:
        raise ValueError('Line spacing must be 0.5 to 3')
    parse_text_color(style.color)
    if kind not in {'name', 'quote'}:
        raise ValueError('kind must be name or quote')
    if style.align == 'justify' and kind != 'quote':
        raise ValueError('Only quotes may be justified')
    if min_size < 1 or start_size < 1:
        raise ValueError('Font sizes must be positive')
    content = (text.upper() if all_caps else text).strip()
    if not content:
        return TextResult(None, ())
    native_draw = ImageDraw.Draw(image)
    unicode_draw = UnicodeDraw(native_draw, warnings, language=style.language)
    needs_unicode = unicode_draw.needs_layout(content, load_font(start_size))
    draw = unicode_draw if needs_unicode else native_draw
    width = max(1, int(max_width if max_width is not None else box.width))
    height = max(1, int(max_height if max_height is not None else box.height))
    # Preserve legacy ascender positioning, fitting and default spacing.
    if (not needs_unicode and style.valign == 'top' and style.align in {'left', 'center'}
            and parse_text_color(style.color) == (20, 30, 50)
            and style.letter_spacing == 0 and style.line_spacing is None
            and style.stroke_width == 0 and style.shadow is None
            and style.name_fit == 'shrink' and min_size == 8):
        from app.services.generator import _render_name, _render_wrapped_text
        if kind == 'name':
            _render_name(draw, text, box, load_font, start_size, style.align, all_caps, min_size, color=parse_text_color(style.color))
        else:
            _render_wrapped_text(draw=draw, text=text, box=box, load_font=load_font,
                                 start_size=start_size, align=style.align,
                                 all_caps=all_caps, min_size=min_size,
                                 max_width=width, max_height=height, spacing=0)
        if warnings is not None:
            _, fitted_size, fitted_lines, _, _, overflow = _fit(
                draw, content, load_font, start_size, min_size, width, height, kind, style)
            if overflow:
                append_once(warnings, fitting_warning(student, kind))
            return TextResult(fitted_size, tuple(fitted_lines), overflow)
        return TextResult(None, ())  # Legacy path does not expose fit metadata.
    font, size, lines, step, bounds, overflow = _fit(
        draw, content, load_font, start_size, min_size, width, height, kind, style)
    top = min(b[1] for b in bounds)
    ink_height = max(b[3] for b in bounds) - top
    y = box.y
    if style.valign == 'middle':
        y += (height - ink_height) / 2 - top
    elif style.valign == 'bottom':
        y += height - ink_height - top
    if overflow:
        append_once(warnings, fitting_warning(student, kind))
    def paint(layer):
        layer_draw = UnicodeDraw(ImageDraw.Draw(layer), warnings, language=style.language) if needs_unicode else ImageDraw.Draw(layer)
        for i, line in enumerate(lines):
            _draw_line(layer_draw, (box.x, y + i * step), line, font, style, width,
                       style.align == 'justify' and i < len(lines) - 1)
    composite_text(image, paint, style.shadow)
    return TextResult(size, tuple(lines), overflow)
