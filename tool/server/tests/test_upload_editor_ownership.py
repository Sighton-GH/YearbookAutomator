import io
from PIL import Image
from app.services import storage
from tests.test_generation_http_errors import generation_client  # noqa: F401


def png(color):
    b=io.BytesIO(); Image.new("RGB",(4,4),color).save(b,"PNG");return b.getvalue()


def test_same_name_upload_does_not_replace_another_person(generation_client):
    client,ws=generation_client
    names=[]
    for color in ("red","blue"):
        r=client.post("/api/mapping/upload-image",data={"workspace_id":ws,"kind":"baby"},files={"file":("face-centred.png",png(color),"image/png")})
        assert r.status_code==200,r.text
        names.append(r.json()["filename"])
    assert names[0]!=names[1]
    assert Image.open(storage.workspace_dir(ws)/"baby"/names[0]).getpixel((0,0))==(255,0,0)


def test_only_editor_owned_upload_uses_cleanup_namespace(generation_client):
    client,ws=generation_client
    names=[]
    for owned in (None,"preview","edit"):
        data={"workspace_id":ws,"kind":"baby"}
        if owned:data["editor_owned"]=owned
        r=client.post("/api/mapping/upload-image",data=data,files={"file":("baby_preview_123.png",png("red"),"image/png")})
        assert r.status_code==200,r.text
        names.append(r.json()["filename"])
    assert names[0].startswith("uploaded_")
    assert names[1].startswith("baby_preview_") and names[2].startswith("baby_edit_")
    r=client.post("/api/mapping/editor-images-cleanup",json={"workspace_id":ws,"candidates":names,"protected_filenames":[]})
    assert r.status_code==200,r.text
    assert r.json()["deleted"]==2
    assert (storage.workspace_dir(ws)/"baby"/names[0]).exists()
