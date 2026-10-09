import test from "node:test";
import assert from "node:assert/strict";
import { clampZoom, DEFAULT_VIEWPORT, handleRadiusImagePx, MAX_ZOOM, nudgeBox, panBy, screenToImage, strokeWidthImagePx, zoomAt } from "./viewport.ts";

test("handle stays 8 CSS px at any scale", () => {
  for (const scale of [0.05, 0.25, 1, 3]) {
    assert.ok(Math.abs(handleRadiusImagePx(scale) * scale - 8) < 1e-9);
    assert.ok(Math.abs(strokeWidthImagePx(scale) * scale - 2) < 1e-9);
  }
  assert.equal(handleRadiusImagePx(0), 8);
});

test("zoomAt keeps anchor point fixed", () => {
  const base = 0.4;
  const anchor = { x: 300, y: 200 };
  const before = screenToImage(anchor, DEFAULT_VIEWPORT, base);
  const vp = zoomAt({ zoom: 1, panX: 10, panY: -5 }, 2, anchor);
  const after = screenToImage(anchor, vp, base);
  const orig = screenToImage(anchor, { zoom: 1, panX: 10, panY: -5 }, base);
  assert.ok(Math.abs(after.x - orig.x) < 1e-9 && Math.abs(after.y - orig.y) < 1e-9);
  assert.equal(vp.zoom, 2);
  assert.ok(before);
});

test("zoom is clamped and unchanged viewport is returned at limit", () => {
  assert.equal(clampZoom(100), MAX_ZOOM);
  const vp = { zoom: MAX_ZOOM, panX: 1, panY: 2 };
  assert.equal(zoomAt(vp, 2, { x: 0, y: 0 }), vp);
  assert.equal(clampZoom(NaN), 1);
});

test("panBy", () => {
  assert.deepEqual(panBy(DEFAULT_VIEWPORT, 5, -3), { zoom: 1, panX: 5, panY: -3 });
});

test("nudge: 1px, shift 10px, clamped, size preserved, other keys null", () => {
  const t = { width: 500, height: 500 };
  const b = { x: 100, y: 100, width: 50, height: 40 };
  assert.deepEqual(nudgeBox(b, "ArrowRight", false, t), { x: 101, y: 100, width: 50, height: 40 });
  assert.deepEqual(nudgeBox(b, "ArrowUp", true, t), { x: 100, y: 90, width: 50, height: 40 });
  assert.deepEqual(nudgeBox({ ...b, x: 0 }, "ArrowLeft", true, t)?.x, 0);
  assert.deepEqual(nudgeBox({ ...b, x: 450 }, "ArrowRight", true, t), { x: 450, y: 100, width: 50, height: 40 });
  assert.equal(nudgeBox(b, "a", false, t), null);
});
