from __future__ import annotations

import io
import zipfile

import anyio
import pytest


def test_workspace_paths_reject_traversal_and_symlinks(monkeypatch, tmp_path):
    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir()
    workspace_id = "secure_ws"

    with pytest.raises(storage.InvalidWorkspacePath):
        storage.workspace_file(workspace_id, "..", "outside.txt")

    outside = tmp_path / "outside"
    outside.mkdir()
    link = storage.workspace_dir(workspace_id) / "link"
    link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(storage.InvalidWorkspacePath):
        storage.workspace_file(workspace_id, "link", "student.txt")


def test_workspace_quota_failure_preserves_existing_file(monkeypatch, tmp_path):
    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir()
    monkeypatch.setenv("YMGA_MAX_WORKSPACE_BYTES", "8")
    target = storage.save_upload("quota_ws", "student.txt", io.BytesIO(b"original"))

    with pytest.raises(storage.UploadTooLarge):
        storage.save_upload("quota_ws", "student.txt", io.BytesIO(b"replacement-too-large"))

    assert target.read_bytes() == b"original"


def test_spreadsheet_validator_rejects_disguised_xlsx():
    from app.services.upload_security import UnsafeUpload, validate_spreadsheet_bytes

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("not-a-workbook.txt", "student data")

    with pytest.raises(UnsafeUpload):
        validate_spreadsheet_bytes(buf.getvalue(), "roster.xlsx")


def test_exported_spreadsheet_text_cannot_become_a_formula():
    from app.routes.generation import _safe_excel_text

    assert _safe_excel_text("=HYPERLINK(\"https://example.invalid\")").startswith("'=")
    assert _safe_excel_text("Normal student quote") == "Normal student quote"


def test_filename_pattern_rejects_nested_repetition():
    from app.services.spreadsheet import _compile_safe_filename_pattern

    with pytest.raises(ValueError):
        _compile_safe_filename_pattern("(a+)+")
    assert _compile_safe_filename_pattern(r"\d{3,4}").fullmatch("0123")


def test_workspace_owner_is_enforced(monkeypatch, tmp_path):
    from app.services import storage, workspace_registry

    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "security-test-secret")
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir()

    resolved = workspace_registry.resolve_workspace(
        license_key="YMGA1-OWNER-A",
        license_type="personal",
        device_id="device-a",
        session_id="session-a",
    )
    assert resolved.workspace_id

    ok, reason = workspace_registry.ensure_workspace_read_access(
        workspace_id=resolved.workspace_id,
        license_key="YMGA1-OWNER-B",
        license_type="personal",
        device_id="device-b",
    )
    assert ok is False
    assert reason == "workspace_owner_mismatch"


def test_streamed_request_limit_is_enforced_without_content_length(monkeypatch):
    from app import main

    monkeypatch.setattr(main, "max_request_bytes", lambda: 4)

    async def endpoint(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = main.TrafficMiddleware(endpoint)

    async def invoke():
        messages = iter(
            [
                {"type": "http.request", "body": b"123", "more_body": True},
                {"type": "http.request", "body": b"45", "more_body": False},
            ]
        )
        sent = []

        async def receive():
            return next(messages)

        async def send(message):
            sent.append(message)

        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/upload",
                "scheme": "https",
                "headers": [],
                "client": ("127.0.0.1", 1234),
            },
            receive,
            send,
        )
        return sent

    sent = anyio.run(invoke)
    start = next(message for message in sent if message["type"] == "http.response.start")
    assert start["status"] == 413


def test_https_responses_receive_security_headers():
    from app import main

    async def endpoint(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def invoke():
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            sent.append(message)

        await main.TrafficMiddleware(endpoint)(
            {
                "type": "http",
                "method": "GET",
                "path": "/health",
                "scheme": "https",
                "headers": [],
                "client": ("127.0.0.1", 1234),
            },
            receive,
            send,
        )
        return sent

    sent = anyio.run(invoke)
    start = next(message for message in sent if message["type"] == "http.response.start")
    headers = dict(start["headers"])
    assert headers[b"strict-transport-security"].startswith(b"max-age=")
    assert headers[b"x-content-type-options"] == b"nosniff"
    assert headers[b"x-frame-options"] == b"DENY"
