"""F1.3 tracked text with pair-based kerning, without new dependencies."""
from __future__ import annotations


def glyph_positions(text, font, letter_spacing=0):
    """Return advances for each glyph; pair differences retain kerning."""
    positions, x = [], 0.0
    for i, char in enumerate(text):
        positions.append(x)
        if i + 1 < len(text):
            x += font.getlength(char + text[i + 1]) - font.getlength(text[i + 1]) + letter_spacing
    return positions


def tracked_bounds(draw, text, font, letter_spacing):
    if not text:
        return (0, 0, 0, 0)
    bounds = [draw.textbbox((x, 0), char, font=font)
              for char, x in zip(text, glyph_positions(text, font, letter_spacing))]
    return (min(b[0] for b in bounds), min(b[1] for b in bounds),
            max(b[2] for b in bounds), max(b[3] for b in bounds))


def draw_tracked(draw, xy, text, font, letter_spacing, *, fill, anchor='la', **kwargs):
    """Use whole-run drawing when tracking=0 to preserve shaping and pixels."""
    if not letter_spacing:
        draw.text(xy, text, font=font, fill=fill, anchor=anchor, **kwargs)
        return
    left, _, right, _ = tracked_bounds(draw, text, font, letter_spacing)
    x, y = xy
    if anchor == 'ma':
        x -= (left + right) / 2
    elif anchor == 'ra':
        x -= right
    for char, dx in zip(text, glyph_positions(text, font, letter_spacing)):
        draw.text((x + dx, y), char, font=font, fill=fill, anchor='la', **kwargs)
