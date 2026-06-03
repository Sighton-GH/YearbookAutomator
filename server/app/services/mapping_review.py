from __future__ import annotations

from app.models.schemas import MappingDecision, PersonRecord


def apply_mapping_decisions(people: list[PersonRecord], decisions: list[MappingDecision]) -> list[PersonRecord]:
    """Apply mapping review decisions to a list of people.

    This logic is used by the `/api/mapping/review` endpoint.

    Notes:
    - `shift`: inserts a blank mugshot at the selected row, shifting mugshots downwards.
    - `shift_up`: pulls later mugshots upward starting at the selected row (overwriting it).
    """

    def index_of(person_index: int) -> int:
        for i, person in enumerate(people):
            if person.index == person_index:
                return i
        return -1

    def shift_from(pos: int) -> None:
        # Insert blank mugshot from pos downward (pos uses list index)
        for i in range(len(people) - 1, pos, -1):
            people[i].mugshot_filename = people[i - 1].mugshot_filename
        people[pos].mugshot_filename = None

    def shift_up_from(pos: int) -> None:
        # Shift mugshots upward starting at pos by pulling later portraits up.
        # This overwrites the portrait at `pos` with the portrait from `pos+1`, etc.
        if not people:
            return
        if pos < 0 or pos >= len(people):
            return
        for i in range(pos, len(people) - 1):
            people[i].mugshot_filename = people[i + 1].mugshot_filename
        people[-1].mugshot_filename = None

    for decision in decisions:
        pos = index_of(decision.person_index)
        if pos < 0:
            continue

        if decision.action == "replace" and decision.replacement_mugshot:
            people[pos].mugshot_filename = decision.replacement_mugshot
        elif decision.action == "remove":
            people[pos].mugshot_filename = None
        elif decision.action in {"shift", "skip"}:
            shift_from(pos)
        elif decision.action == "shift_up":
            shift_up_from(pos)
        # keep does nothing

    return people
