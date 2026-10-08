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
    other_key = licensing.create_license(license_type='commercial', note='other')
    denied = client.post('/api/workspaces/takeover', json={'workspace_id': detail['workspace_id'], 'session_id':'s2'}, headers={'X-License-Key':other_key,'X-Device-Id':'dev2'})
    assert denied.status_code == 403
    taken = client.post('/api/workspaces/takeover', json={'workspace_id': detail['workspace_id'], 'session_id':'s2'}, headers={'X-License-Key':key,'X-Device-Id':'dev2'})
    assert taken.status_code == 403
    from app.services import workspace_registry as registry
    from types import SimpleNamespace
    old_settings = registry.get_face_detection_settings
    monkeypatch.setattr(registry, 'get_face_detection_settings', lambda: SimpleNamespace(enable_admin_workspace_takeover=True, workspace_lock_timeout_seconds=120))
    live = client.post('/api/workspaces/takeover', json={'workspace_id': detail['workspace_id'], 'session_id':'s2'}, headers={'X-License-Key':key,'X-Device-Id':'dev2'})
    assert live.status_code == 409
    store = registry._load_registry()
    binding = registry._binding_by_workspace(store['bindings'], detail['workspace_id'])
    binding['lock']['expires_at'] = 1
    registry._save_registry(store)
    taken = client.post('/api/workspaces/takeover', json={'workspace_id': detail['workspace_id'], 'session_id':'s2'}, headers={'X-License-Key':key,'X-Device-Id':'dev2'})
    assert taken.status_code == 200
    from app.services.workspace_registry import ensure_workspace_write_access
    assert ensure_workspace_write_access(workspace_id=detail['workspace_id'], license_key=key,license_type='commercial', device_id='dev1',session_id='s1') == (False,'workspace_locked')
    assert ensure_workspace_write_access(workspace_id=detail['workspace_id'], license_key=key,license_type='commercial', device_id='dev2',session_id='s2') == (True,None)
