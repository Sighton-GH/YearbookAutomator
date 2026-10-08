import type { PersonRecord, TemplateSlots } from "../api";

type Box = TemplateSlots["baby_photo"];

/**
 * Resolve each person's real baby slot box, mirroring how generation places people:
 * people are chunked per spread, the default slot is the position within the chunk,
 * and explicit assignments (slotAssignments, keyed by person index) win.
 * Returns a map of person.index -> baby box (null when the slot has none).
 */
export function babyBoxesByPerson(opts: {
  people: PersonRecord[]; // already in generation order
  slots: TemplateSlots[];
  slotNumberToIndex: number[];
  slotAssignments: Record<number, number>;
  peoplePerSpread: number;
}): Record<number, Box | null> {
  const { people, slots, slotNumberToIndex, slotAssignments, peoplePerSpread } = opts;
  const out: Record<number, Box | null> = {};
  if (!slots.length) return out;
  const perSpread = Math.max(1, Math.min(peoplePerSpread || 1, slots.length));
  people.forEach((p, i) => {
    const defaultSlotNumber = (i % perSpread) + 1;
    const assigned = slotAssignments[p.index] ?? defaultSlotNumber;
    const actualIdx = slotNumberToIndex[assigned - 1] ?? slotNumberToIndex[0] ?? 0;
    const slot = slots[actualIdx] ?? slots[0];
    out[p.index] = slot?.baby_photo ?? null;
  });
  return out;
}
