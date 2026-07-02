from __future__ import annotations

import time

import pytest

from app.services import admin_settings
from app.services import licensing
from app.services import storage
from app.services.workspace_registry import (
    admin_force_release_lock,
    list_all_sessions_detailed,
    prune_stale_bindings,
    resolve_workspace,
)


def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    # Isolate settings too (commercial_workspace_key_mode affects owner-key
    # derivation) so this test doesn't depend on real on-disk defaults.
    settings_dir = tmp_path / "_settings"
    monkeypatch.setattr(admin_settings, "_SETTINGS_DIR", settings_dir)
    monkeypatch.setattr(admin_settings, "_SETTINGS_PATH", settings_dir / "settings.json")


def test_list_all_sessions_detailed_includes_active_and_stale(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)

    active = resolve_workspace(license_key="YMGA1-ACTIVE", license_type="personal", device_id="dev-active", session_id="sess-active")
    assert active.ok

    stale = resolve_workspace(license_key="YMGA1-STALE", license_type="personal", device_id="dev-stale", session_id="sess-stale")
    assert stale.ok
    # Simulate the workspace having been cleaned up on disk while its registry
    # binding lingers (the real-world scenario after a startup wipe).
    storage.delete_workspace(stale.workspace_id)

    sessions = list_all_sessions_detailed()
    by_id = {s["workspace_id"]: s for s in sessions}

    assert by_id[active.workspace_id]["is_stale"] is False
    assert by_id[active.workspace_id]["on_disk"] is True
    assert by_id[active.workspace_id]["masked_license_key"].startswith("YMGA1-ACTI")
    assert by_id[active.workspace_id]["device_id"] == "dev-active"

    assert by_id[stale.workspace_id]["is_stale"] is True
    assert by_id[stale.workspace_id]["on_disk"] is False


def test_prune_stale_bindings_removes_only_missing_workspaces(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)

    active = resolve_workspace(license_key="YMGA1-KEEP", license_type="personal", device_id="dev-keep", session_id="sess-keep")
    stale = resolve_workspace(license_key="YMGA1-GONE", license_type="personal", device_id="dev-gone", session_id="sess-gone")
    storage.delete_workspace(stale.workspace_id)

    removed = prune_stale_bindings()
    assert removed == 1

    # Pruning twice in a row should be a no-op (nothing left to remove).
    assert prune_stale_bindings() == 0

    sessions = list_all_sessions_detailed()
    ids = {s["workspace_id"] for s in sessions}
    assert active.workspace_id in ids
    assert stale.workspace_id not in ids


def test_admin_force_release_lock_frees_commercial_workspace(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)

    resolved = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-a", session_id="sess-a")
    assert resolved.ok

    # A different device/session trying to resolve the same commercial license
    # should be blocked by the checkout lock.
    conflict = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-b", session_id="sess-b")
    assert conflict.lock_conflict is True

    ok, reason = admin_force_release_lock(resolved.workspace_id)
    assert ok is True
    assert reason is None

    unblocked = resolve_workspace(license_key="YMGA1-COMM", license_type="commercial", device_id="dev-b", session_id="sess-b")
    assert unblocked.ok is True
    assert unblocked.lock_conflict is False

    sessions = list_all_sessions_detailed()
    by_id = {s["workspace_id"]: s for s in sessions}
    # The lock now belongs to dev-b, not force-released again.
    assert by_id[resolved.workspace_id]["locked"] is True
    assert by_id[resolved.workspace_id]["lock_device_id"] == "dev-b"


def test_admin_force_release_lock_unknown_workspace(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)

    ok, reason = admin_force_release_lock("does-not-exist")
    assert ok is False
    assert reason == "workspace_not_registered"


def test_personal_workspace_uses_admin_configured_personal_timeout(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    admin_settings.update_face_detection_settings({"personal_workspace_timeout_seconds": 120})

    resolved = resolve_workspace(license_key="YMGA1-PERS", license_type="personal", device_id="dev-a", session_id="sess-a")
    assert resolved.ok

    meta = storage.read_workspace_meta(resolved.workspace_id)
    assert float(meta["session_expires_at"]) == pytest.approx(time.time() + 120, abs=5)


def test_commercial_workspace_uses_per_license_custom_expiry(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    key = licensing.create_license(license_type="commercial", workspace_expiry_seconds=300)

    resolved = resolve_workspace(license_key=key, license_type="commercial", device_id="dev-a", session_id="sess-a")
    assert resolved.ok

    meta = storage.read_workspace_meta(resolved.workspace_id)
    assert float(meta["session_expires_at"]) == pytest.approx(time.time() + 300, abs=5)


def test_commercial_workspace_with_expiry_disabled_never_marked_expired(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    key = licensing.create_license(license_type="commercial")
    licensing.set_license_workspace_expiry(key, disabled=True, seconds=None)

    resolved = resolve_workspace(license_key=key, license_type="commercial", device_id="dev-a", session_id="sess-a")
    assert resolved.ok

    meta = storage.read_workspace_meta(resolved.workspace_id)
    assert meta.get("workspace_expiry_disabled") is True
    assert "session_expires_at" not in meta

    sessions = list_all_sessions_detailed()
    by_id = {s["workspace_id"]: s for s in sessions}
    assert by_id[resolved.workspace_id]["expiry_disabled"] is True

    # Resolving again immediately (as if resuming much later) should never treat
    # this binding as expired/recreated, since expiry is disabled.
    resumed = resolve_workspace(license_key=key, license_type="commercial", device_id="dev-a", session_id="sess-a")
    assert resumed.ok
    assert resumed.recreated_after_expiry is False
    assert resumed.workspace_id == resolved.workspace_id
