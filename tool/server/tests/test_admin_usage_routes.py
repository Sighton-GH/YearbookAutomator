from __future__ import annotations

import importlib
import base64


def _make_client(monkeypatch, tmp_path):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")
    admin_password = "test-admin-password"
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

    from app.services import system_stats as system_stats_mod

    system_stats_mod.reset_history()

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)
    token = base64.b64encode(f"admin:{admin_password}".encode()).decode()
    client.headers.update({"Authorization": f"Basic {token}"})
    return client, main_mod


def test_usage_page_renders_with_no_data(monkeypatch, tmp_path):
    client, _main_mod = _make_client(monkeypatch, tmp_path)

    resp = client.get("/admin/usage")
    assert resp.status_code == 200
    body = resp.text
    assert "Usage" in body
    assert "Live system resources" in body
    assert "Request traffic" in body
    assert "Tool &amp; license usage" in body
    assert "CPU" in body and "Memory" in body and "GPU" in body
    assert "Generations per day" in body
    assert "Usage by license type" in body
    assert "License inventory" in body
    assert "Most active license keys" in body


def test_usage_page_shows_resource_samples(monkeypatch, tmp_path):
    client, _main_mod = _make_client(monkeypatch, tmp_path)

    from app.services import system_stats as system_stats_mod

    system_stats_mod._sample_once()
    system_stats_mod._sample_once()

    resp = client.get("/admin/usage")
    assert resp.status_code == 200
    assert "Not enough data yet" not in resp.text
    assert "now <strong>" in resp.text


def test_usage_page_shows_recorded_generation_usage(monkeypatch, tmp_path):
    client, _main_mod = _make_client(monkeypatch, tmp_path)

    from app.services import licensing_usage

    licensing_usage.append_usage_event(
        key="YMGA1-USAGEPAGE", license_type="personal", ip=None, device_id="dev-1", route="/api/generation/generate"
    )

    resp = client.get("/admin/usage")
    assert resp.status_code == 200
    assert "YMGA1-USAGEPAGE"[:18] in resp.text


def test_nav_links_to_usage_page_from_every_admin_page(monkeypatch, tmp_path):
    client, _main_mod = _make_client(monkeypatch, tmp_path)

    for path in ["/", "/admin/sessions", "/admin/audit", "/admin/licenses", "/admin/settings", "/admin/usage"]:
        resp = client.get(path)
        assert resp.status_code == 200, path
        assert "Usage</a>" in resp.text, path
