"""Generate the fictional baseline fixture using the selected checkout's renderer.

Run with --server pointing to glm-base-2026-10's tool/server to capture baseline.
No student assets are read; all images and names are generated here.
"""
import argparse
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

def render(server, output):
    sys.path.insert(0, str(Path(server).resolve()))
    from app.models.schemas import GenerationRequest
    from app.services import generator, storage
    with tempfile.TemporaryDirectory() as tmp:
        storage.BASE_DATA = Path(tmp)
        root = storage.workspace_dir('fictional-golden')
        Image.new('RGB', (1000, 700), '#eaf2f8').save(root/'template_clean.png')
        face = Image.new('RGB', (300, 400), '#50809a')
        draw = ImageDraw.Draw(face)
        draw.ellipse((40,40,260,350), fill='#edbe92')
        draw.ellipse((95,140,110,155), fill='black')
        draw.ellipse((190,140,205,155), fill='black')
        (root/'mugshots').mkdir(exist_ok=True)
        face.save(root/'mugshots'/'fictional.png')
        payload = GenerationRequest(workspace_id='fictional-golden', template_id='fictional',
            font_family='DejaVu Sans', name_font_family='DejaVu Sans', quote_font_family='DejaVu Sans',
            slots=[dict(mugshot=dict(x=50,y=50,width=240,height=320),
                        baby_photo=dict(x=330,y=50,width=180,height=180),
                        name=dict(x=50,y=400,width=460,height=80),
                        quote=dict(x=550,y=50,width=340,height=250))],
            people=[dict(index=1,first_name='Avery',last_name='Example',mugshot_filename='fictional.png',quote='Fictional students imagine kind futures.')])
        result=generator.generate_composite(payload)
        Image.open(result).save(output)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--server',required=True);parser.add_argument('--out',required=True);args=parser.parse_args();render(args.server,args.out)
