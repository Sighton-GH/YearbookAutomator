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

    from fastapi.testclient import TestClient

    client = TestClient(main_mod.app)

    key = licensing.create_license(license_type="commercial", note="test")

    # Unprotected endpoints
    assert client.get("/health").status_code == 200
    assert client.post("/api/licensing/validate", json={"key": key}, headers={"X-Device-Id": "dev"}).status_code == 200

    # Protected endpoints require X-License-Key
    r = client.post("/api/workspaces/touch")
    assert r.status_code == 401

    r2 = client.post("/api/workspaces/touch", headers={"X-License-Key": key, "X-Device-Id": "dev"})
    assert r2.status_code != 401
