

def test_indic_zero_combining_class_marks_preserved():
    from app.services.placement import fold_name
    assert fold_name("कुमार")!=fold_name("कुमर")
    assert fold_name("कुमार")=="कुमार"
