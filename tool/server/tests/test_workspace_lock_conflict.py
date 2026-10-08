import importlib

from app.services import licensing


def test_resolve_lock_conflict_includes_workspace_id_for_takeover(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)
    key = licensing.create_license(license_type="commercial", note="test")

    first = client.post(
        "/api/workspaces/resolve",
        json={"session_id": "s1"},
        headers={"X-License-Key": key, "X-Device-Id": "dev1"},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/workspaces/resolve",
        json={"session_id": "s2"},
        headers={"X-License-Key": key, "X-Device-Id": "dev2"},
    )
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "workspace_locked"
    assert detail["workspace_id"] == first.json()["workspace_id"]
