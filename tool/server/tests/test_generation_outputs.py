import importlib

from app.services import licensing


def test_generation_outputs_endpoint_lists_preview_and_spreads(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from fastapi.testclient import TestClient

    client = TestClient(main_mod.app)
    key = licensing.create_license(license_type="commercial", note="test")

    workspace_id = "ws123"
    root = storage.workspace_dir(workspace_id)
    (root / "preview.png").write_bytes(b"preview")
    (root / "output_01.png").write_bytes(b"spread1")
    (root / "output_02.png").write_bytes(b"spread2")

    resp = client.get(
        "/api/generation/outputs",
        params={"workspace_id": workspace_id},
        headers={"X-License-Key": key, "X-Device-Id": "dev1"},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["workspace_id"] == workspace_id
    assert payload["preview"] == "preview.png"
    assert payload["outputs"] == ["output_01.png", "output_02.png"]


def test_generation_outputs_endpoint_falls_back_to_single_output(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from fastapi.testclient import TestClient

    client = TestClient(main_mod.app)
    key = licensing.create_license(license_type="commercial", note="test")

    workspace_id = "ws124"
    root = storage.workspace_dir(workspace_id)
    (root / "output.png").write_bytes(b"spread")

    resp = client.get(
        "/api/generation/outputs",
        params={"workspace_id": workspace_id},
        headers={"X-License-Key": key, "X-Device-Id": "dev1"},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["workspace_id"] == workspace_id
    assert payload["preview"] is None
    assert payload["outputs"] == ["output.png"]
