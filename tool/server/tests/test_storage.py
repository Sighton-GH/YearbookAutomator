import time

from app.services import storage
from app.services.workspace_cleanup import CleanupConfig, run_cleanup_once


def test_clear_all_workspaces_skips_internal_dirs(tmp_path, monkeypatch):
    # Redirect BASE_DATA to a temp folder.
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    # Simulate an internal directory and a real workspace directory.
    (tmp_path / "_licenses").mkdir()
    (tmp_path / "abc123").mkdir()

    deleted = storage.clear_all_workspaces()
    assert deleted == 1

    assert (tmp_path / "abc123").exists() is False
    assert (tmp_path / "_licenses").exists() is True


def test_touch_workspace_sets_session_expiry(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    now_ms = int(time.time() * 1000)

    class _FakeSettings:
        tool_session_timeout_seconds = 12 * 60 * 60

    monkeypatch.setattr(storage, "_tool_session_ttl_seconds", lambda: _FakeSettings.tool_session_timeout_seconds)

    storage.touch_workspace(
        workspace_id,
        session_id="sess_test",
        started_at_ms=now_ms,
        expires_at_ms=now_ms + (12 * 60 * 60 * 1000),
    )

    meta = storage.read_workspace_meta(workspace_id)
    assert meta.get("session_id") == "sess_test"
    assert float(meta.get("session_started_at")) == now_ms / 1000.0
    assert float(meta.get("session_expires_at")) == (now_ms / 1000.0) + (12 * 60 * 60)


def test_touch_workspace_ttl_seconds_override(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    now_ms = int(time.time() * 1000)

    # ttl_seconds passed explicitly overrides the personal-license default helper.
    storage.touch_workspace(
        workspace_id,
        session_id="sess_test",
        started_at_ms=now_ms,
        ttl_seconds=120,
    )

    meta = storage.read_workspace_meta(workspace_id)
    assert float(meta.get("session_expires_at")) == (now_ms / 1000.0) + 120


def test_touch_workspace_expiry_disabled_sets_no_session_expires_at(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    storage.touch_workspace(workspace_id, session_id="sess_test", expiry_disabled=True)

    meta = storage.read_workspace_meta(workspace_id)
    assert meta.get("workspace_expiry_disabled") is True
    assert "session_expires_at" not in meta


def test_touch_workspace_expiry_disabled_then_reenabled_clears_flag(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    storage.touch_workspace(workspace_id, session_id="sess_test", expiry_disabled=True)
    storage.touch_workspace(workspace_id, session_id="sess_test", ttl_seconds=3600, expiry_disabled=False)

    meta = storage.read_workspace_meta(workspace_id)
    assert "workspace_expiry_disabled" not in meta
    assert meta.get("session_expires_at") is not None


def test_cleanup_deletes_when_session_expired(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    workspace_root = storage.workspace_dir(workspace_id)
    (workspace_root / "dummy.txt").write_text("x", encoding="utf-8")

    now_s = time.time()
    storage._write_workspace_meta(
        workspace_id,
        {
            "last_seen": now_s,
            "session_started_at": now_s - (9 * 60 * 60),
            "session_expires_at": now_s - 5,
        },
    )

    deleted = run_cleanup_once(
        CleanupConfig(grace_seconds=20, ttl_seconds=8 * 60 * 60, interval_seconds=60, active_job_window_seconds=300)
    )
    assert deleted == 1
    assert storage.workspace_path(workspace_id).exists() is False


def test_cleanup_never_deletes_workspace_with_expiry_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    workspace_root = storage.workspace_dir(workspace_id)
    (workspace_root / "dummy.txt").write_text("x", encoding="utf-8")

    # Idle far longer than the safety-net TTL, and no session_expires_at at all
    # (as touch_workspace(expiry_disabled=True) leaves it) — should never be swept.
    now_s = time.time()
    storage._write_workspace_meta(
        workspace_id,
        {
            "last_seen": now_s - (100 * 60 * 60),
            "session_started_at": now_s - (100 * 60 * 60),
            "workspace_expiry_disabled": True,
        },
    )

    deleted = run_cleanup_once(
        CleanupConfig(grace_seconds=20, ttl_seconds=8 * 60 * 60, interval_seconds=60, active_job_window_seconds=300)
    )
    assert deleted == 0
    assert storage.workspace_path(workspace_id).exists() is True


def test_cleanup_still_honors_explicit_end_session_when_expiry_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    workspace_id = "abc123"
    workspace_root = storage.workspace_dir(workspace_id)
    (workspace_root / "dummy.txt").write_text("x", encoding="utf-8")

    now_s = time.time()
    storage._write_workspace_meta(
        workspace_id,
        {
            "last_seen": now_s,
            "session_started_at": now_s,
            "workspace_expiry_disabled": True,
            "end_requested_at": now_s - 30,
        },
    )

    deleted = run_cleanup_once(
        CleanupConfig(grace_seconds=20, ttl_seconds=8 * 60 * 60, interval_seconds=60, active_job_window_seconds=300)
    )
    assert deleted == 1
    assert storage.workspace_path(workspace_id).exists() is False
