from __future__ import annotations

from app.models.schemas import PersonRecord
from app.services.placement import fold_name, sort_people_alphabetical


def _p(index, first, last):
    return PersonRecord(index=index, first_name=first, last_name=last)


def test_accented_names_sort_like_the_frontend():
    # Mirror of tool/web/tests/placement-sort.test.mjs.
    people = [_p(1, "Éva", "Dupont"), _p(2, "Erin", "Duran"), _p(3, "Émile", "Durand")]
    out = [f"{x.first_name} {x.last_name}" for x in sort_people_alphabetical(people)]
    assert out == ["Éva Dupont", "Erin Duran", "Émile Durand"]


def test_accented_last_name_initial_is_folded():
    people = [_p(1, "A", "Zed"), _p(2, "B", "Élan"), _p(3, "C", "Eagle")]
    assert [x.last_name for x in sort_people_alphabetical(people)] == ["Eagle", "Élan", "Zed"]


def test_case_first_name_blank_and_index_tiebreaks():
    people = [_p(5, "x", ""), _p(4, "bob", "SMITH"), _p(3, "Amy", "smith"), _p(2, "Amy", "Smith"), _p(1, "Zed", "Abe")]
    assert [x.index for x in sort_people_alphabetical(people)] == [1, 2, 3, 4, 5]


def test_fold_name():
    assert fold_name("  Émile ") == "emile"
    assert fold_name(None) == ""
