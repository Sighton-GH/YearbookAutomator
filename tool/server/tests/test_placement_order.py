from __future__ import annotations

import random

import pytest

from app.models.schemas import Box, PersonRecord, TemplateSlots
from app.services.placement import auto_place_slots_for_people, compute_slot_number_to_index


def _mk_slot(x: int, y: int) -> TemplateSlots:
    # Only mugshot coords matter for ordering; keep other boxes aligned.
    b = Box(x=x, y=y, width=100, height=100)
    return TemplateSlots(mugshot=b, baby_photo=b, name=b, quote=b)


def _grid_two_page_slots(rows: int, cols_per_page: int, gap_x: int = 20, gap_y: int = 30) -> list[TemplateSlots]:
    # Create a 2-page spread: left page then right page.
    # Slot list is returned in "simultaneous" order (y then x across the full spread),
    # matching the parser's intended ordering for fill-both-pages.
    left_origin_x = 0
    right_origin_x = 1000

    slots = []
    for r in range(rows):
        y = 100 + r * (100 + gap_y)
        for c in range(cols_per_page):
            x_left = left_origin_x + c * (100 + gap_x)
            x_right = right_origin_x + c * (100 + gap_x)
            slots.append(_mk_slot(x_left, y))
            slots.append(_mk_slot(x_right, y))

    # simultaneous reading order: y then x across the whole spread
    slots.sort(key=lambda s: (s.mugshot.y, s.mugshot.x))
    return slots


def _expected_index_order(slots: list[TemplateSlots], mode: str) -> list[int]:
    return compute_slot_number_to_index(slots, mode)


@pytest.mark.parametrize("mode", ["simultaneous", "left_then_right"])
def test_auto_place_maps_people_to_reading_order(mode: str):
    slots = _grid_two_page_slots(rows=3, cols_per_page=2)
    # Random names should not matter unless force_alphabetical is true.
    random.seed(2026)
    people = [
        PersonRecord(index=i + 1, first_name=f"F{i}", last_name=f"L{random.randint(0, 9999)}")
        for i in range(8)
    ]

    placed_people, placed_slots = auto_place_slots_for_people(
        people=people,
        slots=slots,
        placement_mode=mode,
        force_alphabetical=False,
        slot_assignments={},
    )

    assert placed_people == people
    assert len(placed_slots) == len(people)

    order = _expected_index_order(slots, mode)
    expected_slot_indices = order[: len(people)]

    for i, slot in enumerate(placed_slots):
        expected = slots[expected_slot_indices[i]]
        assert (slot.mugshot.x, slot.mugshot.y) == (expected.mugshot.x, expected.mugshot.y)


def test_force_alphabetical_sorts_before_placement():
    slots = _grid_two_page_slots(rows=2, cols_per_page=2)
    people = [
        PersonRecord(index=1, first_name="Zed", last_name="Zulu"),
        PersonRecord(index=2, first_name="Amy", last_name="Alpha"),
        PersonRecord(index=3, first_name="Bob", last_name="Alpha"),
        PersonRecord(index=4, first_name="", last_name=""),
    ]

    placed_people, placed_slots = auto_place_slots_for_people(
        people=people,
        slots=slots,
        placement_mode="left_then_right",
        force_alphabetical=True,
        slot_assignments={},
    )

    assert [p.index for p in placed_people] == [2, 3, 1, 4]
    assert len(placed_slots) == len(placed_people)


def test_out_of_range_slot_assignment_falls_back_to_default_slot():
    slots = [_mk_slot(0, 0), _mk_slot(200, 0), _mk_slot(400, 0)]
    people = [
        PersonRecord(index=1, first_name="Ada", last_name="Alpha"),
        PersonRecord(index=2, first_name="Ben", last_name="Beta"),
        PersonRecord(index=3, first_name="Cy", last_name="Gamma"),
    ]

    _, placed_slots = auto_place_slots_for_people(
        people=people,
        slots=slots,
        placement_mode="simultaneous",
        slot_assignments={3: 99},
    )

    assert len(placed_slots) == 3
    assert len({(s.mugshot.x, s.mugshot.y) for s in placed_slots}) == 3
    assert (placed_slots[2].mugshot.x, placed_slots[2].mugshot.y) == (
        slots[2].mugshot.x,
        slots[2].mugshot.y,
    )


def test_duplicate_slot_assignment_raises_with_student_names():
    slots = [_mk_slot(0, 0), _mk_slot(200, 0)]
    people = [
        PersonRecord(index=1, first_name="Alice", last_name="Anderson"),
        PersonRecord(index=2, first_name="Bob", last_name="Brown"),
    ]

    with pytest.raises(ValueError) as excinfo:
        auto_place_slots_for_people(
            people=people,
            slots=slots,
            placement_mode="simultaneous",
            slot_assignments={1: 1, 2: 1},
        )

    message = str(excinfo.value)
    assert "Alice Anderson" in message
    assert "Bob Brown" in message
    assert "slot 1" in message
