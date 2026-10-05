from __future__ import annotations

from dataclasses import dataclass

from app.models.schemas import PersonRecord, TemplateSlots


@dataclass(frozen=True)
class _SlotMeta:
    idx: int
    side: int
    y: int
    x: int


def _normalize_name(s: str | None) -> str:
    return (s or "").strip()


def sort_people_alphabetical(people: list[PersonRecord]) -> list[PersonRecord]:
    # Matches the frontend comparePeopleByLastName behavior.
    def key(p: PersonRecord):
        last = _normalize_name(p.last_name)
        first = _normalize_name(p.first_name)
        last_empty = 1 if not last else 0
        return (last_empty, last.casefold(), first.casefold(), int(p.index or 0))

    return sorted(list(people), key=key)


def compute_slot_number_to_index(
    slots: list[TemplateSlots],
    placement_mode: str,
) -> list[int]:
    """Returns an array mapping logical slot_number-1 -> index into `slots`.

    - simultaneous: trust the slot order as provided (template parser order).
    - left_then_right: order by page side (left then right), then y, then x.

    Reading order is interpreted as top->bottom then left->right (sort by y, then x).
    """

    identity = list(range(len(slots)))
    if not slots:
        return identity

    if placement_mode == "simultaneous":
        return identity

    if placement_mode != "left_then_right":
        # Defensive: unknown mode, keep existing order.
        return identity

    fallback_width = max(1, *(s.mugshot.x + s.mugshot.width for s in slots))
    mid_x = fallback_width / 2

    # Use a tolerance-based row clustering (like the template parser) so small y differences
    # don't flip left/right ordering within a visual row.
    heights = sorted(s.mugshot.height for s in slots)
    med_h = heights[len(heights) // 2]
    row_tol = max(1, int(round(med_h * 0.6)))

    left: list[tuple[int, float, float]] = []
    right: list[tuple[int, float, float]] = []

    for idx, slot in enumerate(slots):
        b = slot.mugshot
        cx = b.x + b.width / 2.0
        cy = b.y + b.height / 2.0
        (left if cx < mid_x else right).append((idx, cy, cx))

    def order_side(items: list[tuple[int, float, float]]) -> list[int]:
        if not items:
            return []
        items.sort(key=lambda t: (t[1], t[2]))
        rows: list[list[tuple[int, float, float]]] = []
        row_centers: list[float] = []
        for idx, cy, cx in items:
            if not rows:
                rows.append([(idx, cy, cx)])
                row_centers.append(cy)
                continue
            if abs(cy - row_centers[-1]) <= row_tol:
                rows[-1].append((idx, cy, cx))
                row_centers[-1] = sum(t[1] for t in rows[-1]) / len(rows[-1])
            else:
                rows.append([(idx, cy, cx)])
                row_centers.append(cy)
        out: list[int] = []
        for row in rows:
            row.sort(key=lambda t: t[2])
            out.extend([t[0] for t in row])
        return out

    return order_side(left) + order_side(right)


def auto_place_slots_for_people(
    *,
    people: list[PersonRecord],
    slots: list[TemplateSlots],
    placement_mode: str = "left_then_right",
    slot_assignments: dict[int, int] | None = None,
    force_alphabetical: bool = False,
) -> tuple[list[PersonRecord], list[TemplateSlots]]:
    """Returns (effective_people, effective_slots) where len(slots)==len(people).

    The N people provided are placed into the first N logical slots. Slot overrides
    (person_index -> slot_number) are applied within this spread.
    """

    if force_alphabetical:
        people = sort_people_alphabetical(people)

    if not slots or not people:
        return people, []

    slot_assignments = slot_assignments or {}

    slot_number_to_index = compute_slot_number_to_index(slots, placement_mode)

    slot_number_to_index = compute_slot_number_to_index(slots, placement_mode)
    n_slots = len(slot_number_to_index)

    def _requested_slot_number(person: PersonRecord) -> int | None:
        raw = slot_assignments.get(int(person.index))
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    claimed: dict[int, int] = {}  # logical slot idx -> position in people
    assigned_logical: list[int | None] = [None] * len(people)

    # Pass 1: honor valid, uncontested assignments in list order. The first
    # person to claim a logical slot keeps it; later collisions fall through
    # to pass 2 instead of raising (nothing in the UI sets slot numbers, so
    # these can only come from older saved sessions and must never dead-end).
    for pos, person in enumerate(people):
        requested = _requested_slot_number(person)
        if requested is None:
            continue
        logical_idx = requested - 1
        if 0 <= logical_idx < n_slots and logical_idx not in claimed:
            claimed[logical_idx] = pos
            assigned_logical[pos] = logical_idx

    # Pass 2: everyone without a slot (no assignment, out-of-range
    # assignment, or lost collision) takes their default position if free,
    # else the lowest unclaimed logical slot.
    for i in range(len(people)):
        if assigned_logical[i] is not None:
            continue
        if 0 <= i < n_slots and i not in claimed:
            logical_idx = i
        elif len(claimed) < n_slots:
            logical_idx = next(l for l in range(n_slots) if l not in claimed)
        else:
            # More people than slots: the generator rejects this case before
            # calling us; keep the default position rather than crashing.
            logical_idx = min(i, n_slots - 1)
        claimed[logical_idx] = i
        assigned_logical[i] = logical_idx

    out_slots: list[TemplateSlots] = []
    for logical in assigned_logical:
        assert logical is not None
        out_slots.append(slots[slot_number_to_index[logical]])

    return people, out_slots
