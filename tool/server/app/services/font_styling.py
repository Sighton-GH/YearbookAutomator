"""F1.6 opt-in styled faces, preserving existing normal-style loading."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import ImageFont

from app.services import fonts
from app.services.name_fitting import append_once
from app.services.storage import workspace_dir, workspace_file, safe_filename, InvalidWorkspacePath


@dataclass(frozen=True)
class VariationAxis:
    tag: str
    minimum: float
    default: float
    maximum: float


def variation_axes(path: Path) -> tuple[VariationAxis, ...]:
    try:
        with TTFont(str(path), lazy=True) as font:
            if 'fvar' not in font:
                return ()
            return tuple(VariationAxis(a.axisTag, a.minValue, a.defaultValue, a.maxValue)
                         for a in font['fvar'].axes)
    except Exception:
        return ()


def apply_variations(font, axes, *, bold=False, italic=False):
    """Set all axes in file order, retaining defaults on unrelated axes."""
    if not axes:
        return
    values = []
    for axis in axes:
        target = axis.default
        if axis.tag == 'wght':
            target = 700 if bold else 400
        elif axis.tag == 'ital':
            target = 1 if italic else 0
        elif axis.tag == 'slnt':
            target = -12 if italic else 0
        values.append(max(axis.minimum, min(axis.maximum, target)))
    font.set_variation_by_axes(values)


def _italic_capable(face):
    return face.italic or any(a.tag in {'ital', 'slnt'} for a in variation_axes(face.path))


def _pick(entries, bold, italic):
    if not italic:
        return fonts._pick_style(entries, bold)
    capable = [f for f in entries if _italic_capable(f)]
    if not capable:
        return fonts._pick_style(entries, bold)
    target = 700 if bold else 400
    return min(capable, key=lambda f: (
        (0 if any(a.tag == 'wght' for a in variation_axes(f.path)) else abs(f.weight - target))
        + 200 * abs(f.width - 5), str(f.path))).path


def resolve_styled_font_file(workspace_id: str, family: str, bold: bool,
                             italic: bool = False) -> Path | None:
    """Uploaded family index first, then system; filename lookup is contained."""
    key = family.strip().strip('"').strip("'").lower()
    root = workspace_dir(workspace_id) / 'fonts'
    try:
        uploaded = workspace_file(workspace_id, 'fonts', safe_filename(family))
        if uploaded.is_file() and uploaded.suffix.lower() in {'.ttf', '.otf'}:
            return uploaded
    except InvalidWorkspacePath:
        pass
    paths = [p for p in root.glob('*.*') if p.suffix.lower() in {'.ttf', '.otf'}]
    for index in (fonts._index(paths), fonts._system_index()):
        if entries := index.get(key):
            return _pick(entries, bold, italic)
    return None


def load_styled_font(workspace_id: str, family: str, weight: str, size: int,
                     font_style: str = 'normal', warnings: list[str] | None = None):
    """Callable factory for render_text's load_font. No shared font mutation.

    Normal style delegates to base then configures variable weights when present.
    The integrator can keep the base loader for exact legacy variable-font pixels.
    """
    from app.services.generator import _load_font, _font_candidates
    if font_style not in {'normal', 'italic'}:
        raise ValueError('Font style must be normal or italic')
    bold = weight.strip().lower() in {'bold', '700', '800', '900'}
    italic = font_style == 'italic'
    chosen = None
    if italic:
        for candidate in _font_candidates(family):
            path = resolve_styled_font_file(workspace_id, candidate, bold, True)
            if path:
                try:
                    chosen = ImageFont.truetype(str(path), size)
                    break
                except (OSError, ValueError):
                    continue
    if chosen is None:
        chosen = _load_font(workspace_id, family, weight, size)
    path = Path(chosen.path) if hasattr(chosen, 'path') else None
    axes = variation_axes(path) if path else ()
    axis_italic = any(a.tag in {'ital', 'slnt'} for a in axes)
    if axes:
        try:
            apply_variations(chosen, axes, bold=bold, italic=italic)
        except (OSError, ValueError, AttributeError):
            append_once(warnings, f'The requested weight or style for {family} could not be applied. The default face was used.')
    if italic and not (axis_italic or (path and fonts._face_metrics(path)[2])
                       or (path and any(word in path.stem.lower() for word in ('italic', 'oblique')))):
        append_once(warnings, f'{family} has no usable italic face. Upright text was used.')
    return chosen
