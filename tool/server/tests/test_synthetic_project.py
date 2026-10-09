"""Fictional test data must be repeatable and self-contained."""
import importlib.util
from pathlib import Path
import zipfile
from PIL import Image

spec = importlib.util.spec_from_file_location('synthetic', Path(__file__).parents[3] / 'scripts/make_synthetic_project.py')
synthetic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(synthetic)

def test_fictional_project_is_byte_deterministic(tmp_path):
    a, b = tmp_path / 'a', tmp_path / 'b'
    synthetic.create(a, 40, 1)
    synthetic.create(b, 40, 1)
    assert sorted(p.name for p in a.iterdir()) == sorted(p.name for p in b.iterdir())
    for p in a.iterdir():
        assert p.read_bytes() == (b / p.name).read_bytes()
    assert Image.open(a / 'annotated.png').size == (4000, 2600)
    with zipfile.ZipFile(a / 'portraits.zip') as z:
        assert len(z.namelist()) == 42
    with zipfile.ZipFile(a / 'baby.zip') as z:
        assert len(z.namelist()) == 20
        assert any(n.endswith('.pdf') for n in z.namelist())

def test_messy_roster_uses_windows_encoding_and_headers(tmp_path):
    synthetic.create(tmp_path, 8, 1, True)
    content = (tmp_path / 'roster.csv').read_bytes()
    assert content.startswith(b'first_name,last_name')
    assert 'José' in content.decode('cp1252')
