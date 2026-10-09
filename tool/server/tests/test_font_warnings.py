from app.services import generator, storage

def test_font_fallback_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)
    warnings=[]
    generator._load_font('fictional','ThisFontDoesNotExist123','normal',warning_cb=warnings.append)
    assert any('ThisFontDoesNotExist123' in w and 'fallback font' in w for w in warnings)
