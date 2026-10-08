import test from "node:test";
import assert from "node:assert/strict";
import type { TemplateSlots } from "../../api";
import { addSlot, createDefaultSlot, deleteSlot, duplicateSlot, remapSlotAssignmentsAfterDelete, slotBounds } from "./slotOps.ts";

const size = { width: 2000, height: 1000 };
const mk = (x: number, y: number): TemplateSlots => ({
  mugshot: { x, y, width: 100, height: 120 },
  baby_photo: { x: x + 110, y, width: 40, height: 40 },
  name: { x, y: y + 125, width: 100, height: 20 },
  quote: { x, y: y + 150, width: 100, height: 50 },
});

test("default slot matches median size and is centred", () => {
  const slots = [mk(0, 0), mk(300, 0), mk(600, 0)];
  const s = createDefaultSlot(slots, size);
  assert.equal(s.mugshot.width, 100);
  assert.equal(s.quote.height, 50);
  assert.equal(s.baby_photo.x - s.mugshot.x, 110);
  const b = slotBounds(s);
  assert.ok(Math.abs(b.x + b.width / 2 - 1000) <= 1);
  assert.ok(Math.abs(b.y + b.height / 2 - 500) <= 1);
});

test("default slot with no existing slots stays on canvas", () => {
  const s = createDefaultSlot([], size);
  const b = slotBounds(s);
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= size.width && b.y + b.height <= size.height);
});

test("addSlot appends, selects, and does not mutate", () => {
  const slots = [mk(0, 0)];
  const r = addSlot(slots, size);
  assert.equal(slots.length, 1);
  assert.equal(r.slots.length, 2);
  assert.equal(r.selectedIndex, 1);
});

test("duplicate offsets by 20 and inserts after source", () => {
  const slots = [mk(10, 10), mk(500, 10)];
  const r = duplicateSlot(slots, 0, size);
  assert.equal(r.slots.length, 3);
  assert.equal(r.selectedIndex, 1);
  assert.equal(r.slots[1].mugshot.x, 30);
  assert.equal(r.slots[1].quote.y, 180);
  assert.deepEqual(r.slots[2], slots[1]);
});

test("duplicate near the edge shifts back instead of collapsing", () => {
  const slots = [mk(1890, 790)];
  const r = duplicateSlot(slots, 0, size);
  assert.notDeepEqual(r.slots[1].mugshot, slots[0].mugshot);
  const b = slotBounds(r.slots[1]);
  assert.ok(b.x + b.width <= size.width && b.y + b.height <= size.height);
});

test("invalid index is a no-op", () => {
  const slots = [mk(0, 0)];
  assert.equal(duplicateSlot(slots, 5, size).slots, slots);
  assert.equal(deleteSlot(slots, -1).slots, slots);
  assert.equal(deleteSlot(slots, 1.5).selectedIndex, null);
});

test("delete adjusts selection", () => {
  const slots = [mk(0, 0), mk(300, 0), mk(600, 0)];
  assert.equal(deleteSlot(slots, 1).selectedIndex, 1);
  assert.equal(deleteSlot(slots, 2).selectedIndex, 1);
  assert.equal(deleteSlot([mk(0, 0)], 0).selectedIndex, null);
  assert.equal(deleteSlot(slots, 0).slots.length, 2);
});

test("slot_assignments remap after delete", () => {
  assert.deepEqual(remapSlotAssignmentsAfterDelete({ 0: 0, 1: 1, 2: 2, 3: 3 }, 1), { 0: 0, 2: 1, 3: 2 });
});
