"""Generate fictional render for default regression comparison.

Run with PYTHONPATH=. from tool/server at base commit 53b904b:
    python tests/golden/generate_detection_baby_defaults.py /tmp/ymga-golden
Copy /tmp/ymga-golden/render.png to detection_baby_defaults.png.
Optional third argument is a new baby_shape override for verification.
"""
import sys
from pathlib import Path
from PIL import Image
from app.models.schemas import Box, TemplateSlots, PersonRecord, GenerationRequest
from app.services import storage
from app.services.generator import generate_composite
storage.BASE_DATA = Path(sys.argv[1])
if storage.BASE_DATA.resolve() == Path(__file__).parent.resolve():
    raise ValueError('Use a scratch directory, not the source tree')
root = storage.workspace_dir('synthetic-render')
(root / 'baby').mkdir(exist_ok=True)
Image.new('RGB', (240, 160), 'white').save(root / 'template_clean.png')
Image.new('RGB', (60, 60), 'red').save(root / 'baby' / 'fictional.png')
slot = TemplateSlots(mugshot=Box(x=10,y=10,width=60,height=60), baby_photo=Box(x=90,y=10,width=60,height=60), name=Box(x=10,y=100,width=180,height=20),quote=Box(x=10,y=125,width=180,height=20))
if len(sys.argv)>2:
    slot.baby_shape = sys.argv[2]
payload = GenerationRequest(workspace_id='synthetic-render', template_id='synthetic-render', slots=[slot],people=[PersonRecord(index=1,first_name='Fictional',last_name='Example',baby_photo_filename='fictional.png',quote='Generated test')],font_family='DejaVu Sans',name_font_size=14,quote_font_size=14)
output = generate_composite(payload)
print(output)
Image.open(output).save(Path(sys.argv[1]) / 'render.png')
