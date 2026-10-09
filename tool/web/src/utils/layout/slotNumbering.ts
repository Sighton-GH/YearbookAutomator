// F3.2 helpers: effective slot numbers and "Renumber" click-sequence ordering.
import type { TemplateSlots } from "../../api";
import type { PlacementMode } from "../../types";
import { computeSlotNumberToIndex } from "../placement.ts";

/**
 * Effective 1-based number for each slot array index, i.e. the number a person fills first..last
 * under the current placement mode. Inverse of computeSlotNumberToIndex.
 * result[slotIndex] = number (1-based).
 */
export function effectiveSlotNumbers(
  slots: TemplateSlots[],
  placementMode: PlacementMode,
  templateWidth: number | null | undefined,
): number[] {
  const numberToIndex = computeSlotNumberToIndex(slots, placementMode, templateWidth);
  const out: number[] = new Array(slots.length).fill(0);
  numberToIndex.forEach((slotIndex, n) => {
    out[slotIndex] = n + 1;
  });
  return out;
}

export type RenumberResult = {
  slots: TemplateSlots[];
  /** order[newPosition] = oldIndex; lets the caller remap slot_assignments / selection. */
  order: number[];
};

/**
 * Renumber mode: slots clicked in sequence become positions 0..k-1 (array order); unclicked
 * slots follow in their existing relative order. Repeated or out-of-range clicks are ignored
 * (first click wins).
 */
export function applyRenumberSequence(slots: TemplateSlots[], clickedIndices: number[]): RenumberResult {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const i of clickedIndices) {
    if (Number.isInteger(i) && i >= 0 && i < slots.length && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  slots.forEach((_, i) => {
    if (!seen.has(i)) order.push(i);
  });
  return { slots: order.map((i) => slots[i]), order };
}

/** Remap slot_assignments (person index -> slot index) after a reorder produced by applyRenumberSequence. */
export function remapSlotAssignmentsAfterReorder(
  assignments: Record<number, number>,
  order: number[],
): Record<number, number> {
  const newIndexOfOld = new Map<number, number>();
  order.forEach((oldIdx, newIdx) => newIndexOfOld.set(oldIdx, newIdx));
  const out: Record<number, number> = {};
  for (const [person, slot] of Object.entries(assignments)) {
    const mapped = newIndexOfOld.get(slot);
    if (mapped !== undefined) out[Number(person)] = mapped;
  }
  return out;
}

/** Translate 1-based logical assignments via physical array identities.
 * order[newIndex] = oldIndex; -1 denotes a newly added slot. Removed pins are dropped.
 * Use the renderer's inferred spread width, not the image width (which may include margins).
 */
export function remapLogicalAssignments(
  assignments: Record<number, number>, before: TemplateSlots[], after: TemplateSlots[],
  mode: PlacementMode, order: number[],
): Record<number, number> {
  const oldIndices = computeSlotNumberToIndex(before, mode, null);
  const newNumbers = effectiveSlotNumbers(after, mode, null);
  const physical: Record<number, number> = {};
  for (const [person, number] of Object.entries(assignments)) {
    if (Number.isInteger(number) && number >= 1 && number <= oldIndices.length)
      physical[Number(person)] = oldIndices[number - 1];
  }
  const remapped = remapSlotAssignmentsAfterReorder(physical, order);
  return Object.fromEntries(Object.entries(remapped).map(([person, index]) => [person, newNumbers[index]]));
}
