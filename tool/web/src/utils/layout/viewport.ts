// F3.3 helpers: constant-CSS-size handles, zoom/pan maths and keyboard nudging.
import type { Box } from "../../api";
import { clampBox } from "../slots.ts";

export const HANDLE_CSS_PX = 8;
export const STROKE_CSS_PX = 2;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export type Viewport = { zoom: number; panX: number; panY: number };
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/**
 * `displayScale` = CSS pixels per template pixel for the fitted image (displayWidth / templateWidth)
 * multiplied by viewport zoom. Returns the size in TEMPLATE pixels that renders as `cssPx` on screen.
 */
export function cssPxToImagePx(cssPx: number, displayScale: number): number {
  if (!(displayScale > 0)) return cssPx;
  return cssPx / displayScale;
}

export function handleRadiusImagePx(displayScale: number, cssRadius: number = HANDLE_CSS_PX): number {
  return cssPxToImagePx(cssRadius, displayScale);
}

export function strokeWidthImagePx(displayScale: number, cssWidth: number = STROKE_CSS_PX): number {
  return cssPxToImagePx(cssWidth, displayScale);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Screen point (relative to the container's top-left) to template pixel under a viewport. */
export function screenToImage(
  pt: { x: number; y: number },
  viewport: Viewport,
  baseScale: number,
): { x: number; y: number } {
  const s = baseScale * viewport.zoom;
  return { x: (pt.x - viewport.panX) / s, y: (pt.y - viewport.panY) / s };
}

/** Zoom by `factor`, keeping the screen point `anchor` fixed over the same image point. */
export function zoomAt(viewport: Viewport, factor: number, anchor: { x: number; y: number }): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  if (zoom === viewport.zoom) return viewport;
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    panX: anchor.x - (anchor.x - viewport.panX) * ratio,
    panY: anchor.y - (anchor.y - viewport.panY) * ratio,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

export function resetViewport(): Viewport {
  return { ...DEFAULT_VIEWPORT };
}

export const NUDGE_SMALL_PX = 1;
export const NUDGE_LARGE_PX = 10;

/**
 * Keyboard nudge: arrows move 1 template px, shift+arrows 10. Result is clamped to the canvas.
 * Returns null for non-arrow keys so callers can leave the event alone.
 */
export function nudgeBox(
  box: Box,
  key: string,
  shift: boolean,
  templateSize: { width: number; height: number },
): Box | null {
  const step = shift ? NUDGE_LARGE_PX : NUDGE_SMALL_PX;
  let dx = 0;
  let dy = 0;
  switch (key) {
    case "ArrowLeft": dx = -step; break;
    case "ArrowRight": dx = step; break;
    case "ArrowUp": dy = -step; break;
    case "ArrowDown": dy = step; break;
    default: return null;
  }
  const moved = clampBox({ ...box, x: box.x + dx, y: box.y + dy }, templateSize);
  // clampBox may shrink width/height at an edge; a nudge must only move the box.
  const x = Math.max(0, Math.min(Math.round(templateSize.width) - box.width, moved.x));
  const y = Math.max(0, Math.min(Math.round(templateSize.height) - box.height, moved.y));
  return { x, y, width: box.width, height: box.height };
}
