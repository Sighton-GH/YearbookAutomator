import type { PersonRecord, TemplateSlots } from "../api";

import { resolvePersonSlots } from "./personPosition";

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
  const active = people.filter(p => !p.excluded);
  for (let start = 0; start < active.length; start += perSpread) {
    const chunk = active.slice(start, start + perSpread);
    const assigned = resolvePersonSlots(chunk, slots.length, slotAssignments);
    chunk.forEach((p, i) => {
      const slot = slots[slotNumberToIndex[assigned[i] - 1] ?? 0];
      out[p.index] = slot?.baby_photo ?? null;
    });
  }
  return out;
}
