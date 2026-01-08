from app.models.schemas import MappingDecision, MappingRequest, PersonRecord
from app.services.mapping_review import apply_mapping_decisions


def _people(mugshots: list[str | None]) -> list[PersonRecord]:
    out: list[PersonRecord] = []
    for i, fn in enumerate(mugshots, start=1):
        out.append(PersonRecord(index=i, first_name=f"F{i}", last_name=f"L{i}", mugshot_filename=fn))
    return out


def test_review_mapping_shift_down_inserts_blank_and_shifts_rest_down():
    # shift at person_index=2 should insert a blank at row 2, shifting rows 2..N-1 down by one.
    payload = MappingRequest(
        workspace_id="w",
        people=_people(["1.png", "2.png", "3.png", "4.png"]),
        decisions=[MappingDecision(person_index=2, action="shift")],
    )

    people = list(payload.people)
    apply_mapping_decisions(people, list(payload.decisions))
    assert [p.mugshot_filename for p in people] == ["1.png", None, "2.png", "3.png"]


def test_review_mapping_shift_up_pulls_later_portraits_up_overwriting_selected():
    # shift_up at person_index=2 should overwrite row 2 with row 3, row 3 with row 4, etc.
    payload = MappingRequest(
        workspace_id="w",
        people=_people(["1.png", "2.png", "3.png", "4.png"]),
        decisions=[MappingDecision(person_index=2, action="shift_up")],
    )

    people = list(payload.people)
    apply_mapping_decisions(people, list(payload.decisions))
    assert [p.mugshot_filename for p in people] == ["1.png", "3.png", "4.png", None]


def test_review_mapping_shift_up_twice_matches_negative_two_shift_behavior():
    payload = MappingRequest(
        workspace_id="w",
        people=_people(["1.png", "2.png", "3.png", "4.png"]),
        decisions=[
            MappingDecision(person_index=2, action="shift_up"),
            MappingDecision(person_index=2, action="shift_up"),
        ],
    )

    people = list(payload.people)
    apply_mapping_decisions(people, list(payload.decisions))
    assert [p.mugshot_filename for p in people] == ["1.png", "4.png", None, None]
