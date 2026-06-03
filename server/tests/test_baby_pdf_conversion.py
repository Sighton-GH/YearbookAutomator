import importlib
import io
import json
import zipfile

import pytest


def test_baby_zip_pdf_conversion_assigns_png(tmp_path, monkeypatch):
    pytest.importorskip("fitz", reason="PyMuPDF not installed")

    # Isolate filesystem + licensing store.
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    from app.services import licensing

    key = licensing.create_license(license_type="commercial", note="test")

    # Import after env is set so main app uses the temp store.
    from app import main as main_mod

    importlib.reload(main_mod)

    # Redirect workspace storage under tmp_path.
    from app.services import storage as storage_mod

    storage_mod.BASE_DATA = tmp_path / "data"
    storage_mod.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from fastapi.testclient import TestClient

    client = TestClient(main_mod.app)

    # Create a simple one-page PDF in-memory.
    import fitz  # type: ignore

    doc = fitz.open()
    try:
        page = doc.new_page()
        page.insert_text((72, 72), "John Smith")
        pdf_bytes = doc.tobytes()
    finally:
        doc.close()

    # Zip contains a PDF named to match "John Smith".
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Smith_John.pdf", pdf_bytes)
    zip_buf.seek(0)

    people = [{"index": 1, "first_name": "John", "last_name": "Smith"}]

    files = {"baby_zip": ("baby.zip", zip_buf.getvalue(), "application/zip")}
    data = {
        "workspace_id": "testws",
        "people_json": json.dumps(people),
        "advanced_name_match": "true",
        "partial_name_match": "false",
        "convert_pdfs": "true",
        "remove_background": "false",
        "background_mode": "simple",
    }

    headers = {"X-License-Key": key, "X-Device-Id": "dev"}

    r = client.post("/api/mapping/upload-baby-zip", data=data, files=files, headers=headers)
    assert r.status_code == 200, r.text
    payload = r.json()

    assert payload["people"][0]["baby_photo_filename"], "Expected baby_photo_filename to be assigned"
    assert payload["people"][0]["baby_photo_filename"].lower().endswith(".png")

    # File should exist on disk in workspace baby/.
    out_name = payload["people"][0]["baby_photo_filename"]
    out_path = storage_mod.workspace_dir("testws") / "baby" / out_name
    assert out_path.exists()
    assert out_path.stat().st_size > 0
