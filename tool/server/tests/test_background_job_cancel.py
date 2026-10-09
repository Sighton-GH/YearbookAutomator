import asyncio
import io
import threading
import time

import pytest
from PIL import Image
from starlette.requests import Request

from app.routes import mapping
from app.services import background_jobs as jobs, storage
from app.services.background_removal import prepare_background_model


@pytest.mark.parametrize("preview", [False, True])
def test_cancel_worker_releases_reservation_before_retry(tmp_path, monkeypatch, preview):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    monkeypatch.setattr(mapping, "enforce_workspace_write", lambda *args: None)
    monkeypatch.setattr(mapping, "prepare_background_model", lambda *args: None)
    from types import SimpleNamespace
    monkeypatch.setattr(mapping, "get_face_detection_settings", lambda: SimpleNamespace(enable_background_removal_ops=True))
    entered, proceed = threading.Event(), threading.Event()
    buf = io.BytesIO()
    Image.new("RGB", (12, 12), "blue").save(buf, format="PNG")
    source = storage.workspace_file("cancel-test", "baby", "original.png")
    source.parent.mkdir(exist_ok=True)
    source.write_bytes(buf.getvalue())

    def slow_remove(*args, **kwargs):
        entered.set()
        assert proceed.wait(5)
        return buf.getvalue()

    monkeypatch.setattr(mapping, "remove_background_bytes", slow_remove)
    request = Request({"type": "http", "headers": []})
    start = mapping.remove_background_preview_job if preview else mapping.remove_background_job
    kwargs = dict(request=request, workspace_id="cancel-test", kind="baby", filename="original.png", background_mode="simple")
    if preview:
        kwargs["force"] = False
    job_id = asyncio.run(start(**kwargs))["job_id"]
    assert entered.wait(5)
    assert asyncio.run(mapping.remove_background_cancel(request, job_id)) == {"ok": True}
    proceed.set()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if jobs.get_job(job_id)["status"] == "cancelled" and "cancel-test" not in jobs._active_workspaces:
            break
        time.sleep(0.01)
    assert jobs.get_job(job_id)["status"] == "cancelled"
    assert jobs.get_job(job_id)["result_bytes"] is None
    assert list(source.parent.iterdir()) == [source]
    # Start a real second worker, not just a reservation check.
    second = asyncio.run(start(**kwargs))["job_id"]
    while jobs.get_job(second)["status"] == "running" and time.monotonic() < deadline:
        time.sleep(0.01)
    assert jobs.get_job(second)["status"] == "done"


def test_cancel_requires_workspace_write_and_unknown_job_is_not_found(monkeypatch):
    request = Request({"type": "http", "headers": []})
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        asyncio.run(mapping.remove_background_cancel(request, "unknown-job"))
    assert exc.value.status_code == 404
    jobs.start_job("denied", "denied-workspace", kind="baby", source_filename="x.png", mode="simple", output_filename="x.png")
    def denied(*args):
        raise HTTPException(403)
    monkeypatch.setattr(mapping, "enforce_workspace_write", denied)
    with pytest.raises(HTTPException):
        asyncio.run(mapping.remove_background_cancel(request, "denied"))
    assert not jobs.get_job("denied")["cancel_requested"]


def test_download_status_only_for_missing_ultra_model(tmp_path, monkeypatch):
    from app.services import background_removal as removal
    monkeypatch.setenv("U2NET_HOME", str(tmp_path))
    acquired, messages = [], []
    monkeypatch.setattr(removal, "_acquire_rembg_session", lambda: acquired.append(1))
    monkeypatch.setattr(removal, "_release_rembg_session", lambda session: None)
    prepare_background_model("simple", messages.append)
    assert not messages
    prepare_background_model("ultra_complex", messages.append)
    assert "179 MB" in messages[0]
    assert len(acquired) == 1
    (tmp_path / "isnet-general-use.onnx").touch()
    prepare_background_model("ultra_complex", messages.append)
    assert len(messages) == 1
