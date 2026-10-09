import test from "node:test";
import assert from "node:assert/strict";
import type { TemplateSlots } from "../../api";
import { applyRenumberSequence, effectiveSlotNumbers, remapSlotAssignmentsAfterReorder } from "./slotNumbering.ts";

const mk = (x: number, y: number): TemplateSlots => ({
  mugshot: { x, y, width: 100, height: 100 },
  baby_photo: { x, y, width: 10, height: 10 },
  name: { x, y, width: 10, height: 10 },
  quote: { x, y, width: 10, height: 10 },
});

test("simultaneous numbers are array order", () => {
  const slots = [mk(0, 0), mk(900, 0), mk(200, 0)];
  assert.deepEqual(effectiveSlotNumbers(slots, "simultaneous", 1000), [1, 2, 3]);
});

test("left_then_right: left page first, inverse of numberToIndex", () => {
  // array order: right, left-bottom, left-top
  const slots = [mk(800, 0), mk(100, 300), mk(100, 0)];
  const nums = effectiveSlotNumbers(slots, "left_then_right", 1000);
  assert.deepEqual(nums, [3, 2, 1]);
});

test("renumber: clicked first, rest keep order", () => {
  const slots = [mk(0, 0), mk(1, 0), mk(2, 0), mk(3, 0)];
  const r = applyRenumberSequence(slots, [2, 0, 2, 9, -1]);
  assert.deepEqual(r.order, [2, 0, 1, 3]);
  assert.equal(r.slots[0], slots[2]);
  assert.equal(applyRenumberSequence(slots, []).order.join(), "0,1,2,3");
});

test("assignments follow reorder", () => {
  assert.deepEqual(remapSlotAssignmentsAfterReorder({ 0: 2, 1: 0 }, [2, 0, 1, 3]), { 0: 0, 1: 1 });
});
