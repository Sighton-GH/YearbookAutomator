// F3.1 helpers: add / duplicate / delete slots as pure functions.
// Not wired into any component yet. See docs/specs/glm-2026-10/prep/F3.1-integration.md.
import type { Box, TemplateSlots } from "../../api";
import { clampBox } from "../slots.ts";

export type TemplateSize = { width: number; height: number };
export type SlotEditResult = { slots: TemplateSlots[]; selectedIndex: number | null };

const KEYS = ["mugshot", "baby_photo", "name", "quote"] as const;
export type SlotKey = (typeof KEYS)[number];

export const DUPLICATE_OFFSET_PX = 20;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function slotBounds(slot: TemplateSlots): Box {
  const boxes = KEYS.map((k) => slot[k]);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function clampSlot(slot: TemplateSlots, size: TemplateSize): TemplateSlots {
  return {
    ...slot,
    mugshot: clampBox(slot.mugshot, size),
    baby_photo: clampBox(slot.baby_photo, size),
    name: clampBox(slot.name, size),
    quote: clampBox(slot.quote, size),
  };
}

/**
 * A default 4-box slot sized like the median existing slot (per-box median
 * width/height, per-box median offset from the mugshot), centred on the canvas.
 * With no existing slots, falls back to proportions of the template size.
 */
export function createDefaultSlot(existing: TemplateSlots[], size: TemplateSize): TemplateSlots {
  let template: TemplateSlots;
  if (existing.length) {
    const rel = (k: SlotKey, axis: "x" | "y") => median(existing.map((s) => s[k][axis] - s.mugshot[axis]));
    const dim = (k: SlotKey, d: "width" | "height") => median(existing.map((s) => s[k][d]));
    const build = (k: SlotKey): Box => ({
      x: k === "mugshot" ? 0 : rel(k, "x"),
      y: k === "mugshot" ? 0 : rel(k, "y"),
      width: dim(k, "width"),
      height: dim(k, "height"),
    });
    template = { mugshot: build("mugshot"), baby_photo: build("baby_photo"), name: build("name"), quote: build("quote") };
  } else {
    const w = size.width / 8;
    const h = size.height / 4;
    template = {
      mugshot: { x: 0, y: 0, width: w, height: h },
      baby_photo: { x: w * 1.1, y: 0, width: w * 0.5, height: h * 0.5 },
      name: { x: 0, y: h * 1.05, width: w, height: h * 0.15 },
      quote: { x: 0, y: h * 1.25, width: w, height: h * 0.3 },
    };
  }
  const b = slotBounds(template);
  const dx = Math.round(size.width / 2 - (b.x + b.width / 2));
  const dy = Math.round(size.height / 2 - (b.y + b.height / 2));
  return clampSlot(translateSlot(template, dx, dy), size);
}

export function translateSlot(slot: TemplateSlots, dx: number, dy: number): TemplateSlots {
  const mv = (b: Box): Box => ({ ...b, x: b.x + dx, y: b.y + dy });
  return { ...slot, mugshot: mv(slot.mugshot), baby_photo: mv(slot.baby_photo), name: mv(slot.name), quote: mv(slot.quote) };
}

/** Append a default slot; the new slot becomes the selection. Input is not mutated. */
export function addSlot(slots: TemplateSlots[], size: TemplateSize): SlotEditResult {
  const next = [...slots, createDefaultSlot(slots, size)];
  return { slots: next, selectedIndex: next.length - 1 };
}

/**
 * Insert a copy of slots[index] right after it, offset by `offset` px (default 20) on both axes.
 * If the offset copy would run off the canvas it is shifted back by the other direction
 * so it never collapses onto the original. Out-of-range index is a no-op.
 */
export function duplicateSlot(
  slots: TemplateSlots[],
  index: number,
  size: TemplateSize,
  offset: number = DUPLICATE_OFFSET_PX,
): SlotEditResult {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    return { slots, selectedIndex: null };
  }
  const src = slots[index];
  const b = slotBounds(src);
  const dir = (b.x + b.width + offset > size.width || b.y + b.height + offset > size.height) ? -1 : 1;
  const copy = clampSlot(translateSlot(src, dir * offset, dir * offset), size);
  const next = [...slots.slice(0, index + 1), copy, ...slots.slice(index + 1)];
  return { slots: next, selectedIndex: index + 1 };
}

/**
 * Remove a slot. Selection moves to the slot now at the same position, or the new last slot,
 * or null when the list becomes empty. Out-of-range index is a no-op.
 * Callers must also drop/shift any `slot_assignments` that reference indices >= index (see
 * remapSlotAssignmentsAfterDelete).
 */
export function deleteSlot(slots: TemplateSlots[], index: number): SlotEditResult {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    return { slots, selectedIndex: null };
  }
  const next = slots.filter((_, i) => i !== index);
  return { slots: next, selectedIndex: next.length ? Math.min(index, next.length - 1) : null };
}

/**
 * `slot_assignments` maps person index -> slot index. After deleting slot `deleted`, drop the
 * entries pointing at it and shift later slot indices down by one.
 */
export function remapSlotAssignmentsAfterDelete(
  assignments: Record<number, number>,
  deleted: number,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [person, slot] of Object.entries(assignments)) {
    if (slot === deleted) continue;
    out[Number(person)] = slot > deleted ? slot - 1 : slot;
  }
  return out;
}
