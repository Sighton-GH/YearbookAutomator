import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageChops

def test_default_render_matches_untouched_base(tmp_path):
    root=Path(__file__).parents[3]
    output=tmp_path/'actual.png'
    subprocess.run([sys.executable, str(root/'scripts/make_golden_render.py'), '--server', str(root/'tool/server'), '--out', str(output)],check=True)
    with Image.open(output) as actual, Image.open(Path(__file__).parent/'golden/default.png') as expected:
        assert actual.size == expected.size
        assert ImageChops.difference(actual.convert('RGB'),expected.convert('RGB')).getbbox() is None
