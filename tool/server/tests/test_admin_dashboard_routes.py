from __future__ import annotations

import base64
import importlib
import re


def _make_client(monkeypatch, tmp_path, *, admin_password: str = "test-admin-password", authenticate: bool = True):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")
    monkeypatch.setenv("YMGA_LICENSE_ADMIN_PASSWORD", admin_password)
    monkeypatch.setenv("YMGA_LICENSE_ADMIN_USERNAME", "admin")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage as storage_mod

    monkeypatch.setattr(storage_mod, "BASE_DATA", tmp_path / "data")
    storage_mod.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from app.services import admin_settings as admin_settings_mod

    settings_dir = tmp_path / "_settings"
    monkeypatch.setattr(admin_settings_mod, "_SETTINGS_DIR", settings_dir)
    monkeypatch.setattr(admin_settings_mod, "_SETTINGS_PATH", settings_dir / "settings.json")

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)
    if authenticate and admin_password:
        client.headers.update(_basic_auth_header("admin", admin_password))
    return client, main_mod, storage_mod


def _basic_auth_header(username: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def test_dashboard_page_renders_with_stats(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.text
    assert "Dashboard" in body
    assert "Active sessions" in body
    assert "Licenses issued" in body
    assert "System resources" in body
    assert "Recent activity" in body
    assert "Recent workspace events" in body
    assert 'href="/admin/audit"' in body
    assert 'href="/admin/usage"' in body
    # The dead login form should no longer be present.
    assert "action='/admin/login'" not in body


def test_audit_log_page_renders_recorded_events(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    from app.services.workspace_registry import resolve_workspace

    resolved = resolve_workspace(license_key="YMGA1-AUDIT", license_type="personal", device_id="dev-audit", session_id="sess-audit")

    resp = client.get("/admin/audit")
    assert resp.status_code == 200
    body = resp.text
    assert "Audit Log" in body
    assert "workspace_created" in body
    assert resolved.workspace_id[:14] in body


def test_audit_log_page_empty_state(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    resp = client.get("/admin/audit")
    assert resp.status_code == 200
    assert "No audit events recorded yet" in resp.text


def test_sessions_page_renders_and_prune_works(monkeypatch, tmp_path):
    client, _main_mod, storage_mod = _make_client(monkeypatch, tmp_path)

    from app.services.workspace_registry import resolve_workspace

    active = resolve_workspace(license_key="YMGA1-ACTIVE", license_type="personal", device_id="dev-active", session_id="sess-1")
    stale = resolve_workspace(license_key="YMGA1-STALE", license_type="personal", device_id="dev-stale", session_id="sess-2")
    storage_mod.delete_workspace(stale.workspace_id)

    resp = client.get("/admin/sessions")
    assert resp.status_code == 200
    assert "Sessions" in resp.text
    assert "orphaned" in resp.text
    assert active.workspace_id[:10] in resp.text

    prune_resp = client.post("/admin/sessions/prune", follow_redirects=True)
    assert prune_resp.status_code == 200
    assert "Removed" in prune_resp.text
    assert stale.workspace_id[:10] not in prune_resp.text


def test_sessions_delete_action_removes_workspace(monkeypatch, tmp_path):
    client, _main_mod, storage_mod = _make_client(monkeypatch, tmp_path)

    from app.services.workspace_registry import resolve_workspace

    resolved = resolve_workspace(license_key="YMGA1-DELME", license_type="personal", device_id="dev-x", session_id="sess-x")
    workspace_dir = storage_mod.workspace_path(resolved.workspace_id)
    assert workspace_dir.exists()

    resp = client.post("/admin/sessions/delete", data={"workspace_id": resolved.workspace_id}, follow_redirects=True)
    assert resp.status_code == 200
    assert "Workspace deleted" in resp.text
    assert not workspace_dir.exists()


def test_sessions_force_release_action(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    from app.services.workspace_registry import resolve_workspace

    resolved = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-a", session_id="sess-a")
    conflict = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-b", session_id="sess-b")
    assert conflict.lock_conflict is True

    resp = client.post("/admin/sessions/release", data={"workspace_id": resolved.workspace_id}, follow_redirects=True)
    assert resp.status_code == 200
    assert "released" in resp.text.lower()

    unblocked = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-b", session_id="sess-b")
    assert unblocked.ok is True


def test_licenses_page_create_revoke_unlock_all_round_trip(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    create_resp = client.post(
        "/admin/licenses/create",
        data={"license_type": "commercial", "note": "smoke-test"},
    )
    assert create_resp.status_code == 200
    match = re.search(r"<pre class=\"mono\"[^>]*>([^<]+)</pre>", create_resp.text)
    assert match, create_resp.text
    key = match.group(1).strip()
    assert key.startswith("YMGA1-")

    list_resp = client.get("/admin/licenses")
    assert list_resp.status_code == 200
    assert key in list_resp.text
    assert "active" in list_resp.text.lower()

    # Toggle "unlock all steps" on.
    toggle_resp = client.post(
        "/admin/licenses/set-unlock-all",
        data={"key": key, "enabled": "1"},
        follow_redirects=True,
    )
    assert toggle_resp.status_code == 200

    from app.services import licensing

    rec = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec.unlock_all_steps is True

    revoke_resp = client.post("/admin/licenses/revoke", data={"key": key}, follow_redirects=True)
    assert revoke_resp.status_code == 200
    assert "revoked" in revoke_resp.text.lower()

    rec_after = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec_after.revoked is True


def test_settings_page_renders_performance_card(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    resp = client.get("/admin/settings")
    assert resp.status_code == 200
    body = resp.text
    assert "Performance &amp; Resource Limits" in body
    assert "network_upload_limit_kbps" in body
    assert "cpu_throttle_percent" in body
    assert "gpu_disabled" in body
    assert "Tool Feature Toggles" in body
    assert "enable_quotes_feature" in body
    assert "enable_custom_font_upload" in body


def test_tool_feature_toggles_form_round_trips_and_api_reflects_it(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    flags_before = client.get("/api/admin/settings/features").json()
    assert flags_before["enable_quotes_feature"] is True
    assert flags_before["enable_custom_font_upload"] is True

    resp = client.post(
        "/admin/settings/tool-features",
        data={
            # Omitting a checkbox means "unchecked" in real browser form submits;
            # only enable_pdf_output stays checked here.
            "enable_pdf_output": "1",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    assert "Tool feature toggles updated" in resp.text

    flags_after = client.get("/api/admin/settings/features").json()
    assert flags_after["enable_quotes_feature"] is False
    assert flags_after["enable_baby_photos_feature"] is False
    assert flags_after["enable_pdf_output"] is True
    assert flags_after["enable_tiff_output"] is False
    assert flags_after["enable_alphabetical_sort_option"] is False
    assert flags_after["enable_advanced_name_matching"] is False
    assert flags_after["enable_custom_font_upload"] is False


def test_settings_performance_form_round_trips(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path)

    resp = client.post(
        "/admin/settings/performance",
        data={
            "network_upload_limit_kbps": "512",
            "network_download_limit_kbps": "2048",
            "cpu_max_threads": "2",
            "cpu_throttle_percent": "60",
            "gpu_throttle_percent": "80",
            "gpu_max_concurrent_ops": "1",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    assert "Performance" in resp.text and "updated" in resp.text

    from app.services.admin_settings import get_face_detection_settings

    s = get_face_detection_settings()
    assert s.network_upload_limit_kbps == 512
    assert s.network_download_limit_kbps == 2048
    assert s.cpu_max_threads == 2
    assert s.cpu_throttle_percent == 60
    assert s.gpu_throttle_percent == 80
    assert s.gpu_max_concurrent_ops == 1

    # Values should also be reflected back into the rendered form.
    page = client.get("/admin/settings")
    assert 'value="512"' in page.text
    assert 'value="2048"' in page.text


def test_admin_requires_auth_when_password_configured(monkeypatch, tmp_path):
    password = "correct-horse-battery"
    client, _main_mod, _storage_mod = _make_client(
        monkeypatch,
        tmp_path,
        admin_password=password,
        authenticate=False,
    )

    no_auth = client.get("/")
    assert no_auth.status_code == 401
    assert "Sign-in required" in no_auth.text

    wrong_auth = client.get("/", headers=_basic_auth_header("admin", "nope"))
    assert wrong_auth.status_code == 401

    good_auth = client.get("/", headers=_basic_auth_header("admin", password))
    assert good_auth.status_code == 200
    assert "Dashboard" in good_auth.text


def test_admin_is_disabled_without_strong_password(monkeypatch, tmp_path):
    client, _main_mod, _storage_mod = _make_client(monkeypatch, tmp_path, admin_password="", authenticate=False)
    response = client.get("/")
    assert response.status_code == 401
    assert "disabled" in response.text.lower()
