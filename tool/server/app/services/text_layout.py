"""Opt-in F1 text renderer. Existing generator callers remain unchanged.

The default path delegates to the base renderer to retain its exact pixels.
Coordinates and effects are in output pixels. Callers own request validation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal

from PIL import Image, ImageDraw, ImageFont

from app.services.text_color import parse_text_color

FontLoader = Callable[[int], ImageFont.ImageFont]


@dataclass(frozen=True)
class TextStyle:
    align: Literal['left', 'center', 'right', 'justify'] = 'left'
    valign: Literal['top', 'middle', 'bottom'] = 'top'
    color: str = '#141e32'


@dataclass(frozen=True)
class TextResult:
    size: int | None
    lines: tuple[str, ...]
    overflow: bool = False


def _width(draw, text, font, style):
    bbox = draw.textbbox((0, 0), text, font=font)
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
    return draw.textbbox((0, 0), 'A', font=font)[3]


def _fit(draw, text, load_font, start_size, min_size, width, height, kind, style):
    for size in range(max(start_size, min_size), min_size - 1, -1):
        font = load_font(size)
        lines = [text] if kind == 'name' else _wrap(draw, text, font, width, style)
        step = _line_step(draw, font, size, style)
        bounds = [draw.textbbox((0, i * step), line, font=font)
                  for i, line in enumerate(lines)]
        ink_height = max(b[3] for b in bounds) - min(b[1] for b in bounds)
        fits = (all(_width(draw, line, font, style) <= width for line in lines)
                and ink_height <= height)
        if fits or size == min_size:
            return font, size, lines, step, bounds, not fits
    raise AssertionError('unreachable')


def _draw_line(draw, xy, text, font, style, width, justify):
    x, y = xy
    if justify and len(text.split()) > 1:
        words = text.split()
        gap = (width - sum(_width(draw, word, font, style) for word in words)) / (len(words) - 1)
        for word in words:
            draw.text((x, y), word, font=font, fill=parse_text_color(style.color), anchor='la')
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
        draw.text((x, y), text, font=font, fill=parse_text_color(style.color), anchor=anchor)


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
    draw = ImageDraw.Draw(image)
    width = max(1, int(max_width if max_width is not None else box.width))
    height = max(1, int(max_height if max_height is not None else box.height))
    # Preserve legacy ascender positioning, fitting and default spacing.
    if (style.valign == 'top' and style.align in {'left', 'center'}
            and parse_text_color(style.color) == (20, 30, 50)):
        from app.services.generator import _render_name, _render_wrapped_text
        if kind == 'name':
            _render_name(draw, text, box, load_font, start_size, style.align, all_caps, min_size)
        else:
            _render_wrapped_text(draw=draw, text=text, box=box, load_font=load_font,
                                 start_size=start_size, align=style.align,
                                 all_caps=all_caps, min_size=min_size,
                                 max_width=width, max_height=height, spacing=0)
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
    for i, line in enumerate(lines):
        _draw_line(draw, (box.x, y + i * step), line, font, style, width,
                   style.align == 'justify' and i < len(lines) - 1)
    return TextResult(size, tuple(lines), overflow)
