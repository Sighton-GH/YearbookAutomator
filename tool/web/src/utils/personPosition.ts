import type { PersonRecord } from "../api";

// Mirrors placement.py: explicit assignments claim first, list order breaks ties.
export function resolvePersonSlots(people: PersonRecord[], count: number, assignments: Record<number, number>): number[] {
  const result: Array<number | null> = people.map(() => null);
  const claimed = new Set<number>();
  people.forEach((p, i) => {
    const slot = assignments[p.index];
    if (Number.isInteger(slot) && slot >= 1 && slot <= count && !claimed.has(slot)) {
      result[i] = slot; claimed.add(slot);
    }
  });
  people.forEach((_, i) => {
    if (result[i] !== null) return;
    const slot = i < count && !claimed.has(i + 1) ? i + 1 : Array.from({length: count}, (_, k) => k + 1).find(k => !claimed.has(k));
    result[i] = slot ?? count; claimed.add(result[i]!);
  });
  return result as number[];
}

// Exchange list membership across spreads without discarding excluded records.
export function moveToSpread(people: PersonRecord[], personIndex: number, spread: number, perSpread: number): PersonRecord[] {
  const activePositions = people.flatMap((p, i) => p.excluded ? [] : [i]);
  const source = activePositions.find(i => people[i].index === personIndex);
  const target = activePositions[(spread - 1) * perSpread];
  if (source == null || target == null || Math.floor(activePositions.indexOf(source) / perSpread) === spread - 1) return people;
  const next = [...people];
  [next[source], next[target]] = [next[target], next[source]];
  return next;
}
