"""Generated baby photos only; no model downloads or real workspaces."""
import io
import json
import zipfile
from dataclasses import replace

import pytest
from fastapi import FastAPI
from PIL import Image

from app.routes import mapping
from app.services import storage
from live_test_client import LiveTestClient


@pytest.mark.parametrize("result", ["raises", "invalid_output", "success", "not_requested", "disabled"])
def test_baby_zip_background_fallback(tmp_path, monkeypatch, result):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    monkeypatch.setattr(mapping, "enforce_workspace_write", lambda *args: None)
    settings = replace(mapping.get_face_detection_settings(),
        enable_baby_photos_feature=True,
        enable_background_removal_ops=result != "disabled",
    )
    monkeypatch.setattr(mapping, "get_face_detection_settings", lambda: settings)
    original = io.BytesIO()
    Image.new("RGB", (32, 32), "orange").save(original, format="PNG")
    raw = original.getvalue()
    processed = io.BytesIO()
    Image.new("RGBA", (32, 32), (255, 0, 0, 128)).save(processed, format="PNG")
    calls = []

    def remove(content, *, mode):
        calls.append((content, mode))
        if result == "raises":
            raise RuntimeError("synthetic segmentation failure")
        if result == "invalid_output":
            return b"not an image"
        return processed.getvalue()

    monkeypatch.setattr(mapping, "remove_background_bytes", remove)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("Silva_Ana.png", raw)
    app = FastAPI()
    app.include_router(mapping.router, prefix="/api/mapping")
    client = LiveTestClient(app)
    try:
        response = client.post("/api/mapping/upload-baby-zip", data={
            "workspace_id": "synthetic-baby-fallback",
            "people_json": json.dumps([{
                "index": 1, "first_name": "Ana", "last_name": "Silva",
                "baby_background_removal_failed": True,
            }]),
            "remove_background": str(result != "not_requested").lower(),
        }, files={"baby_zip": ("baby.zip", archive.getvalue(), "application/zip")})
        assert response.status_code == 200, response.text
        payload = response.json()
        person = payload["people"][0]
        filename = person["baby_photo_filename"]
        saved = storage.workspace_dir("synthetic-baby-fallback") / "baby" / filename
        failed = result in {"raises", "invalid_output"}
        assert person["baby_background_removal_failed"] is failed
        assert saved.read_bytes() == (processed.getvalue() if result == "success" else raw)
        if failed:
            assert filename == "Silva_Ana.png"
            assert payload["warnings"] == [
                "Background removal failed for Ana Silva's photo; the original photo was kept."
            ]
        else:
            assert payload["warnings"] == []
        assert len(calls) == (0 if result in {"not_requested", "disabled"} else 1)
    finally:
        client.close()
