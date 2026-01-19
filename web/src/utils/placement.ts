import type { PersonRecord, TemplateSlots } from "../api";
import type { PlacementMode } from "../types";

export function computeSlotNumberToIndex(
  slots: TemplateSlots[],
  placementMode: PlacementMode,
  templateWidth: number | null | undefined,
): number[] {
  const identity = slots.map((_, i) => i);
  if (!slots.length) return identity;

  // For "simultaneous": the parse step already returns slots in correct reading order
  // across the full spread.
  if (placementMode === "simultaneous") return identity;

  // For "left_then_right": renumber slots so slot #1..#N fills the left page in reading
  // order, then the right page in reading order.
  const fallbackWidth = Math.max(1, ...slots.map((s) => s.mugshot.x + s.mugshot.width));
  const midX = (templateWidth ?? fallbackWidth) / 2;

  const heights = [...slots.map((s) => s.mugshot.height)].sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 1;
  const rowTol = Math.max(1, Math.round(medH * 0.6));

  type Item = { idx: number; cy: number; cx: number };

  const left: Item[] = [];
  const right: Item[] = [];
  slots.forEach((slot, idx) => {
    const b = slot.mugshot;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    (cx < midX ? left : right).push({ idx, cy, cx });
  });

  const orderSide = (items: Item[]): number[] => {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
    const rows: Item[][] = [];
    const rowCenters: number[] = [];
    for (const it of sorted) {
      if (!rows.length) {
        rows.push([it]);
        rowCenters.push(it.cy);
        continue;
      }
      const last = rowCenters[rowCenters.length - 1];
      if (Math.abs(it.cy - last) <= rowTol) {
        rows[rows.length - 1].push(it);
        const row = rows[rows.length - 1];
        rowCenters[rowCenters.length - 1] = row.reduce((sum, r) => sum + r.cy, 0) / row.length;
      } else {
        rows.push([it]);
        rowCenters.push(it.cy);
      }
    }

    const out: number[] = [];
    for (const row of rows) {
      row.sort((a, b) => a.cx - b.cx);
      out.push(...row.map((r) => r.idx));
    }
    return out;
  };

  return [...orderSide(left), ...orderSide(right)];
}

export function comparePeopleByLastName(a: PersonRecord, b: PersonRecord): number {
  const normalize = (s: string | null | undefined) => (s ?? "").trim();

  const aLast = normalize(a.last_name);
  const bLast = normalize(b.last_name);
  const aLastEmpty = !aLast;
  const bLastEmpty = !bLast;
  if (aLastEmpty !== bLastEmpty) return aLastEmpty ? 1 : -1;

  // Full lexicographic compare (not first-letter only)
  const lastCmp = aLast.localeCompare(bLast, undefined, { sensitivity: "base" });
  if (lastCmp) return lastCmp;

  const aFirst = normalize(a.first_name);
  const bFirst = normalize(b.first_name);
  const firstCmp = aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
  if (firstCmp) return firstCmp;

  // Stable fallback: spreadsheet row index
  return (a.index ?? 0) - (b.index ?? 0);
}
