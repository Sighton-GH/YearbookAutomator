from PIL import Image

from app.services import storage
from tests.test_generation_http_errors import generation_client  # noqa: F401

SLOT = {
    "mugshot": {"x": 20, "y": 20, "width": 120, "height": 150},
    "baby_photo": {"x": 300, "y": 20, "width": 60, "height": 60},
    "name": {"x": 20, "y": 180, "width": 200, "height": 40},
    "quote": {"x": 20, "y": 230, "width": 220, "height": 120},
}


def _body(workspace_id, n_people=3, **extra):
    return {
        "workspace_id": workspace_id, "template_id": "t", "font_family": "DejaVu Sans",
        "slots": [SLOT, {k: {**v, "x": v["x"] + 0} for k, v in SLOT.items()}],
        "people": [{"index": i + 1, "first_name": f"Fictional{i}", "last_name": "Person", "quote": "A quote."} for i in range(n_people)],
        "auto_place": True, "count_usage": True, "output_width": 100, **extra,
    }


def test_preview_strip_renders_first_two_and_downsizes(generation_client, monkeypatch):
    client, workspace_id = generation_client
    monkeypatch.setenv("YMGA_RENDER_PREFER_GPU", "false")
    monkeypatch.setenv("YMGA_OPENCL", "false")
    Image.new("RGB", (2400, 2400), "white").save(storage.workspace_dir(workspace_id) / "template_clean.png")
    # Three people, two slots: the full render would refuse; the strip takes the first two only.
    resp = client.post("/api/generation/preview-strip", json=_body(workspace_id, name_color="#ff0000"))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["output"] == "preview_strip.png"
    # Cropped to the two slots (x 20-240, y 20-350 plus margin), not the whole 2400px template.
    assert data["width"] < 1200 and data["height"] < 1200
    assert 200 < data["width"] <= 400 and 300 < data["height"] <= 420
    download = client.get("/api/generation/download", params={"workspace_id": workspace_id, "filename": "preview_strip.png"})
    assert download.status_code == 200 and download.content[:4] == b"\x89PNG"
    assert not (storage.workspace_dir(workspace_id) / "output.png").exists()


def test_preview_strip_without_people_is_a_plain_400(generation_client):
    client, workspace_id = generation_client
    resp = client.post("/api/generation/preview-strip", json=_body(workspace_id, n_people=0))
    assert resp.status_code == 400
