import type { TemplateSlots } from "../api";

export function groupSlotsByProximity(slots: TemplateSlots[], maxKeep?: number): TemplateSlots[] {
  if (slots.length <= 1) return [...slots].slice(0, maxKeep ?? slots.length);
  const centers = slots.map((slot, idx) => {
    const box = slot.mugshot;
    return {
      idx,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      span: (box.width + box.height) / 2,
    };
  });

  const avgSpan = centers.reduce((acc, c) => acc + c.span, 0) / centers.length;
  const threshold = avgSpan * 0.75;
  const remaining = [...centers];
  const groups: number[][] = [];

  const distance = (a: typeof centers[number], b: typeof centers[number]) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  };

  while (remaining.length) {
    const seed = remaining.shift()!;
    const group = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const candidate = remaining[i];
        const close = group.some((g) => distance(g, candidate) <= threshold);
        if (close) {
          group.push(candidate);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }
    groups.push(group.map((g) => g.idx));
  }

  const centerByIdx = new Map(centers.map((c) => [c.idx, c]));
  groups.sort((a, b) => {
    const ay = Math.min(...a.map((idx) => centerByIdx.get(idx)!.y));
    const by = Math.min(...b.map((idx) => centerByIdx.get(idx)!.y));
    if (ay !== by) return ay - by;
    const ax = Math.min(...a.map((idx) => centerByIdx.get(idx)!.x));
    const bx = Math.min(...b.map((idx) => centerByIdx.get(idx)!.x));
    return ax - bx;
  });

  const orderedIndices = groups.flatMap((group) =>
    [...group].sort((a, b) => {
      const ca = centerByIdx.get(a)!;
      const cb = centerByIdx.get(b)!;
      return ca.y === cb.y ? ca.x - cb.x : ca.y - cb.y;
    })
  );

  const ordered = orderedIndices.map((idx) => slots[idx]);
  const cap = typeof maxKeep === "number" ? Math.max(1, maxKeep) : ordered.length;
  return ordered.slice(0, cap);
}
