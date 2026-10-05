from app.services.name_matching import normalize_name, match_people, unique_stored_name


def test_accents_are_transliterated():
    assert normalize_name("José García") == "jose garcia"
    assert normalize_name("Zoë O'Brien-Smith") == "zoe o brien smith"


def test_exact_token_match_beats_compact_substring():
    people = {1: (["ann"], ["lee"]), 2: (["anne"], ["leeds"])}
    assert match_people("Anne Leeds", people) == [2]
    assert match_people("Ann Lee", people) == [1]


def test_compact_fallback_still_works_without_delimiters():
    assert match_people("johndoe2024", {7: (["john"], ["doe"])}) == [7]


def test_unique_stored_name():
    used = set()
    assert unique_stored_name(used, "photo.jpg") == "photo.jpg"
    assert unique_stored_name(used, "photo.jpg") == "photo_2.jpg"
    assert unique_stored_name(used, "photo.jpg") == "photo_3.jpg"
