"""F1.2 colour parsing, shared by text effects and the integrator's validation."""
from __future__ import annotations

import re

DEFAULT_TEXT_COLOR = '#141e32'


def parse_text_color(value: str) -> tuple[int, int, int]:
    """Accept the existing baby-colour hex format; reject invalid input."""
    text = value.strip().removeprefix('#')
    if not re.fullmatch(r'(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})', text):
        raise ValueError('Text colour must be a hex colour like #141e32')
    if len(text) == 3:
        text = ''.join(c * 2 for c in text)
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))
