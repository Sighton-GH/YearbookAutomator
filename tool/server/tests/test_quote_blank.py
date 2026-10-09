from app.models.schemas import PersonRecord

def test_quote_blank_defaults_false_and_roundtrips():
    person = PersonRecord(index=1, first_name='Ana', last_name='Silva')
    assert not person.quote_blank
    restored = PersonRecord.model_validate({**person.model_dump(), 'quote_blank': True})
    assert restored.quote_blank
