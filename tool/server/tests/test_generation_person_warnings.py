from PIL import Image
from app.models.schemas import GenerationRequest
from app.services import generator, storage

def test_render_face_miss_names_person(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'BASE_DATA',tmp_path)
    monkeypatch.setenv('YMGA_RENDER_PREFER_GPU','false')
    root=storage.workspace_dir('fictional-warnings')
    Image.new('RGB',(800,600),'white').save(root/'template_clean.png')
    (root/'baby').mkdir(exist_ok=True)
    Image.new('RGB',(200,200),'red').save(root/'baby'/'plain.png')
    monkeypatch.setattr(generator,'_detect_face_center',lambda image: None)
    payload=GenerationRequest(workspace_id='fictional-warnings',template_id='fictional',font_family='DejaVu Sans',center_baby_on_face=True,
      slots=[dict(mugshot=dict(x=0,y=0,width=200,height=200),baby_photo=dict(x=210,y=0,width=200,height=200),name=dict(x=0,y=220,width=200,height=70),quote=dict(x=0,y=300,width=200,height=120))],
      people=[dict(index=1,first_name='Ana',last_name='Example',baby_photo_filename='plain.png')])
    warnings=[]
    generator.generate_composite(payload,warning_cb=warnings.append)
    assert any('Ana Example' in w and "find a face" in w for w in warnings)
