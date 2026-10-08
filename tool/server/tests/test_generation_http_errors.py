import importlib
from uuid import uuid4

import pytest

from app.services import licensing, progress, storage


@pytest.fixture
def generation_client(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir()
    from app import main
    importlib.reload(main)
    from live_test_client import LiveTestClient
    from app.services.workspace_registry import resolve_workspace
    key = licensing.create_license(license_type="commercial", note="synthetic test")
    workspace_id = resolve_workspace(
        license_key=key, license_type="commercial", device_id="test-device",
        session_id=uuid4().hex,
    ).workspace_id
    client = LiveTestClient(main.app)
    client.headers.update({"X-License-Key": key, "X-Device-Id": "test-device"})
    try:
        yield client, workspace_id
    finally:
        client.close()


def test_missing_output_returns_readable_404(generation_client):
    client, workspace_id = generation_client
    response = client.get("/api/generation/download", params={"workspace_id": workspace_id})
    assert response.status_code == 404
    assert response.json() == {"detail": "This rendered file is no longer available. Render it again, then download it."}


def test_deleted_output_returns_404_instead_of_json_download(generation_client):
    client, workspace_id = generation_client
    path = storage.workspace_dir(workspace_id) / "output.png"
    path.write_bytes(b"synthetic download")
    assert client.get("/api/generation/download", params={"workspace_id": workspace_id}).content == b"synthetic download"
    path.unlink()
    assert client.get("/api/generation/download", params={"workspace_id": workspace_id}).status_code == 404


def test_missing_job_returns_readable_404(generation_client):
    client, _ = generation_client
    response = client.get("/api/generation/status", params={"job_id": uuid4().hex})
    assert response.status_code == 404
    assert response.json() == {"detail": "This render job is no longer available. Check your results or start a new render."}


def test_existing_job_still_returns_status(generation_client):
    client, workspace_id = generation_client
    job_id = uuid4().hex
    progress.start_job(job_id, workspace_id)
    response = client.get("/api/generation/status", params={"job_id": job_id})
    assert response.status_code == 200
    assert response.json()["workspace_id"] == workspace_id
