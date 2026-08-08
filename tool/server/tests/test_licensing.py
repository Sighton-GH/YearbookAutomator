import importlib

from app.services import licensing


def test_create_validate_revoke(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", note="test")
    ok, meta = licensing.validate_license(key, ip="1.2.3.4", device_id="dev")
    assert ok is True
    assert meta["license_type"] == "commercial"

    assert licensing.revoke_license(key) is True
    ok, meta = licensing.validate_license(key, ip="1.2.3.4", device_id="dev")
    assert ok is False
    assert meta["reason"] == "revoked"


def test_personal_license_bound_and_monthly_limited(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_PERSONAL_MONTHLY_LIMIT", "5")

    ip = "10.0.0.1"
    device_id = "device-abc"
    key1 = licensing.get_or_create_personal_license(ip=ip, device_id=device_id)
    key2 = licensing.get_or_create_personal_license(ip=ip, device_id=device_id)
    assert key1 == key2

    ok, meta = licensing.validate_license(key1, ip=ip, device_id=device_id)
    assert ok is True
    assert meta["license_type"] == "personal"

    ok_bad, meta_bad = licensing.validate_license(key1, ip=ip, device_id="other")
    assert ok_bad is False
    assert meta_bad["reason"] == "device_mismatch"

    for _ in range(5):
        ok_use, _ = licensing.validate_and_record_use(key1, ip=ip, device_id=device_id)
        assert ok_use is True
    ok6, meta6 = licensing.validate_and_record_use(key1, ip=ip, device_id=device_id)
    assert ok6 is False
    assert meta6["reason"] == "monthly_limit"


def test_personal_license_loopback_ip_equivalence(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    device_id = "device-loopback"
    key = licensing.get_or_create_personal_license(ip="127.0.0.1", device_id=device_id)

    ok_v4, _ = licensing.validate_license(key, ip="127.0.0.1", device_id=device_id)
    assert ok_v4 is True

    # Should still validate if localhost resolves to IPv6 loopback.
    ok_v6, _ = licensing.validate_license(key, ip="::1", device_id=device_id)
    assert ok_v6 is True


def test_workspace_expiry_defaults_to_no_override(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", note="test")
    disabled, seconds = licensing.get_workspace_expiry_policy(key)
    assert disabled is False
    assert seconds is None

    rec = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec.workspace_expiry_disabled is False
    assert rec.workspace_expiry_seconds is None


def test_create_license_with_workspace_expiry_overrides(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(
        license_type="commercial",
        note="test",
        workspace_expiry_seconds=120,
    )
    disabled, seconds = licensing.get_workspace_expiry_policy(key)
    assert disabled is False
    assert seconds == 120


def test_set_license_workspace_expiry_updates_existing_record(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", note="test")

    assert licensing.set_license_workspace_expiry(key, disabled=True, seconds=None) is True
    disabled, seconds = licensing.get_workspace_expiry_policy(key)
    assert disabled is True
    assert seconds is None

    # Re-enabling with a custom duration clears the disabled flag and sets seconds.
    assert licensing.set_license_workspace_expiry(key, disabled=False, seconds=3600) is True
    disabled2, seconds2 = licensing.get_workspace_expiry_policy(key)
    assert disabled2 is False
    assert seconds2 == 3600


def test_get_workspace_expiry_policy_unknown_key_returns_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    disabled, seconds = licensing.get_workspace_expiry_policy("YMGA1-NOTREAL")
    assert disabled is False
    assert seconds is None


def test_max_uses_enforced(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", max_uses=1)
    ok1, _ = licensing.validate_and_record_use(key, ip="1.2.3.4", device_id="dev")
    assert ok1 is True
    ok2, meta2 = licensing.validate_and_record_use(key, ip="1.2.3.4", device_id="dev")
    assert ok2 is False
    assert meta2["reason"] == "max_uses"


def test_middleware_blocks_protected_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    # Import after env is set so main app uses the temp store.
    from app import main as main_mod

    importlib.reload(main_mod)

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)

    key = licensing.create_license(license_type="commercial", note="test")

    # Unprotected endpoints
    assert client.get("/health").status_code == 200
    assert client.post("/api/licensing/validate", json={"key": key}, headers={"X-Device-Id": "dev"}).status_code == 200
    assert client.cookies.get("ymga_license_session") == key

    # Protected endpoints require X-License-Key
    client.cookies.clear()
    r = client.post("/api/workspaces/touch")
    assert r.status_code == 401

    r2 = client.post("/api/workspaces/touch", headers={"X-License-Key": key, "X-Device-Id": "dev"})
    assert r2.status_code != 401


def test_usage_counts_only_on_processing(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    # Import after env is set so main app uses the temp store.
    from app import main as main_mod

    importlib.reload(main_mod)

    # Prevent the background generation thread from doing real work in this test.
    from app.routes import generation as generation_mod
    from app.services.storage import workspace_dir

    def _fake_generate_composite(payload, progress_cb=None):
        out = workspace_dir(payload.workspace_id) / "output.png"
        out.write_bytes(b"fake")
        return out

    monkeypatch.setattr(generation_mod, "generate_composite", _fake_generate_composite)

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)

    key = licensing.create_license(license_type="commercial", max_uses=10, note="test")
    from app.services.workspace_registry import resolve_workspace

    resolved = resolve_workspace(
        license_key=key,
        license_type="commercial",
        device_id="dev",
        session_id="test-session",
    )
    assert resolved.workspace_id
    workspace_id = resolved.workspace_id

    # Non-processing calls should NOT count usage.
    r = client.post(
        "/api/workspaces/touch",
        data={"workspace_id": workspace_id},
        headers={"X-License-Key": key, "X-Device-Id": "dev", "X-Client-Session-Id": "test-session"},
    )
    assert r.status_code == 200

    recs = licensing.list_licenses()
    rec = next(x for x in recs if x.key == key)
    assert rec.uses == 0

    # Starting a generation IS a processing action and should increment usage.
    payload = {
        "workspace_id": workspace_id,
        "template_id": workspace_id,
        "slots": [
            {
                "mugshot": {"x": 0, "y": 0, "width": 1, "height": 1},
                "baby_photo": {"x": 0, "y": 0, "width": 1, "height": 1},
                "name": {"x": 0, "y": 0, "width": 1, "height": 1},
                "quote": {"x": 0, "y": 0, "width": 1, "height": 1},
            }
        ],
        "people": [{"index": 1, "first_name": "A", "last_name": "B"}],
        "font_family": "Arial",
        "count_usage": True,
    }
    g = client.post(
        "/api/generation/generate",
        json=payload,
        headers={"X-License-Key": key, "X-Device-Id": "dev", "X-Client-Session-Id": "test-session"},
    )
    assert g.status_code == 200
    assert "job_id" in g.json()

    recs2 = licensing.list_licenses()
    rec2 = next(x for x in recs2 if x.key == key)
    assert rec2.uses == 1


def test_delete_license_removes_record(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", note="test")
    assert any(r.key == key for r in licensing.list_licenses())

    assert licensing.delete_license(key) is True
    assert not any(r.key == key for r in licensing.list_licenses())
    # Deleting again is a no-op.
    assert licensing.delete_license(key) is False


def test_update_license_edits_only_provided_fields(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="personal", note="original", max_uses=None)

    assert licensing.update_license(key, expires_at=1999999999, note="updated") is True
    rec = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec.expires_at == 1999999999
    assert rec.note == "updated"
    # monthly_limit/max_uses left untouched since not passed.
    assert rec.max_uses is None

    # Explicitly clearing expires_at with None.
    assert licensing.update_license(key, expires_at=None) is True
    rec2 = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec2.expires_at is None
    assert rec2.note == "updated"

    # Unknown key is a no-op.
    assert licensing.update_license("YMGA1-NOTREAL", note="x") is False


def test_record_license_seen_updates_last_used_without_counting_uses(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")

    key = licensing.create_license(license_type="commercial", note="test")
    rec_before = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec_before.last_used_at is None
    assert rec_before.uses == 0

    licensing.record_license_seen(key, ip="9.9.9.9", device_id="dev-1")
    rec_after = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec_after.last_used_at is not None
    assert rec_after.last_seen_ip == "9.9.9.9"
    assert rec_after.last_seen_device_id == "dev-1"
    # Only "seen" bookkeeping changed, not the generation-usage counter.
    assert rec_after.uses == 0

    # Immediately calling again within the throttle window doesn't move last_used_at.
    first_seen = rec_after.last_used_at
    licensing.record_license_seen(key, ip="9.9.9.9", device_id="dev-1")
    rec_same = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec_same.last_used_at == first_seen

    # But a changed IP/device is recorded even inside the throttle window.
    licensing.record_license_seen(key, ip="8.8.8.8", device_id="dev-1")
    rec_changed = next(r for r in licensing.list_licenses() if r.key == key)
    assert rec_changed.last_seen_ip == "8.8.8.8"
