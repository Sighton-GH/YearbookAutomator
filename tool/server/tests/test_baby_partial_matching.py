from app.models.schemas import PersonRecord
from app.routes import mapping


def test_compact_filename_name_strips_junk_prefix():
    # Example reported: timestamp/blob prefix should not tank similarity.
    stem = "1739241452474blob_Aria Mohammadvalisam"
    assert mapping._compact_filename_name(stem) == "ariamohammadvalisam"


def test_partial_matching_prefers_best_person():
    people = [
        PersonRecord(index=1, first_name="Aria", last_name="Mohammadvalisamani"),
        PersonRecord(index=2, first_name="Ari", last_name="Mohammadvali"),
    ]
    stem_compact = mapping._compact_filename_name("1739241452474blob_Aria Mohammadvalisam")
    best_idx, best_score, second_score = mapping._best_partial_name_match(stem_compact, people)
    assert best_idx == 1
    assert best_score > 0.86
    assert best_score > second_score
