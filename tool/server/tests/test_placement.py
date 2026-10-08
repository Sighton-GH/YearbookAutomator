

def test_indic_zero_combining_class_marks_preserved():
    from app.services.placement import fold_name
    assert fold_name("कुमार")!=fold_name("कुमर")
    assert fold_name("कुमार")=="कुमार"


def test_shared_contract_is_independent_of_runtime_unicode(monkeypatch):
    from app.services import placement
    monkeypatch.setattr(placement.unicodedata,"combining",lambda _:230)
    assert placement.fold_name("कुमार")=="कुमार"
    assert placement.fold_name("A\u1ac1")=="a\u1ac1"
