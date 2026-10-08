from __future__ import annotations

import importlib
import io
import time

import numpy as np
from PIL import Image, ImageDraw

from app.services.background_removal import remove_background


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_remove_background_simple_keeps_subject_and_clears_corner():
    img = Image.new("RGB", (256, 256), (245, 245, 245))
    d = ImageDraw.Draw(img)
    d.ellipse((56, 40, 200, 240), fill=(30, 60, 200))

    out = remove_background(_png_bytes(img), mode="simple")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    # Corner should be transparent; centre should be opaque.
    assert out_img.getpixel((0, 0))[3] < 20
    assert out_img.getpixel((128, 160))[3] > 200


def test_remove_background_complex_grabcut_outputs_alpha():
    # Busy-ish background with a solid-ish subject.
    rng = np.random.default_rng(123)
    noise = rng.integers(210, 255, size=(256, 256, 3), dtype=np.uint8)
    base = Image.fromarray(noise, mode="RGB")
    d = ImageDraw.Draw(base)
    d.rectangle((70, 50, 190, 230), fill=(20, 20, 20))

    out = remove_background(_png_bytes(base), mode="complex")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    assert out_img.getpixel((0, 0))[3] < 80
    assert out_img.getpixel((128, 140))[3] > 120



def _setup(tmp_path, monkeypatch, session_id):
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
    try:
        from app.services import licensing
        from app.services.workspace_registry import resolve_workspace

        key = licensing.create_license(license_type="commercial", note="test")
        workspace_id = resolve_workspace(
            license_key=key,
            license_type="commercial",
            device_id="dev1",
            session_id=session_id,
        ).workspace_id
        assert workspace_id
        headers = {"X-License-Key": key, "X-Device-Id": "dev1"}
        return client, workspace_id, headers
    except Exception:
        client.close()
        raise


def test_preview_result_can_be_fetched_twice(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "preview-twice")
    try:
        from app.services import background_jobs

        job_id = "preview-twice-job"
        background_jobs.start_job(
            job_id,
            workspace_id,
            kind="baby",
            source_filename="baby.png",
            mode="simple",
            output_filename="baby_nobg.png",
        )
        background_jobs.update_job(job_id, result_bytes=b"fake-preview-png")
        background_jobs.update_job(job_id, progress=100, status="done", message="Done")

        first = client.get(
            "/api/mapping/remove-background-preview-result",
            params={"job_id": job_id},
            headers=headers,
        )
        assert first.status_code == 200, first.text
        second = client.get(
            "/api/mapping/remove-background-preview-result",
            params={"job_id": job_id},
            headers=headers,
        )
        assert second.status_code == 200, second.text
        assert second.content == first.content == b"fake-preview-png"
    finally:
        client.close()


def test_remove_background_runs_when_alpha_is_tiny_noise():
    # Some PNGs contain a small number of semi/transparent pixels even when the
    # background is not actually removed. We should still perform background
    # removal in that case.
    img = Image.new("RGBA", (256, 256), (245, 245, 245, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((56, 40, 200, 240), fill=(30, 60, 200, 255))
    # Add a single fully transparent pixel not on the border.
    img.putpixel((128, 10), (245, 245, 245, 0))

    out = remove_background(_png_bytes(img), mode="simple")
    out_img = Image.open(io.BytesIO(out)).convert("RGBA")

    # Corner should be transparent; centre should be opaque.
    assert out_img.getpixel((0, 0))[3] < 20
    assert out_img.getpixel((128, 160))[3] > 200

def _start_job(background_jobs, job_id, workspace_id):
    background_jobs.start_job(
        job_id,
        workspace_id,
        kind="preview",
        source_filename="src.png",
        mode="simple",
        output_filename="out.png",
    )


def test_start_job_drops_previous_workspace_preview_bytes():
    from app.services import background_jobs

    background_jobs._jobs.clear()
    background_jobs._active_workspaces.clear()
    try:
        _start_job(background_jobs, "job-a", "ws1")
        background_jobs.update_job("job-a", status="done", result_bytes=b"aaa")
        _start_job(background_jobs, "job-b", "ws1")

        job_a = background_jobs.get_job("job-a")
        assert job_a is not None
        assert job_a["result_bytes"] is None
        assert job_a["status"] == "done"

        background_jobs.update_job("job-b", result_bytes=b"bbb")
        _start_job(background_jobs, "job-c", "ws2")
        job_b = background_jobs.get_job("job-b")
        assert job_b is not None
        assert job_b["result_bytes"] == b"bbb"
    finally:
        background_jobs._jobs.clear()
        background_jobs._active_workspaces.clear()


def test_start_job_drops_preview_bytes_older_than_30_minutes():
    from app.services import background_jobs

    background_jobs._jobs.clear()
    background_jobs._active_workspaces.clear()
    try:
        _start_job(background_jobs, "job-old", "ws-old")
        background_jobs.update_job("job-old", status="done", result_bytes=b"old-bytes")
        with background_jobs._lock:
            background_jobs._jobs["job-old"]["result_bytes_at"] = time.time() - (31 * 60)
        _start_job(background_jobs, "job-new", "ws-new")

        job_old = background_jobs.get_job("job-old")
        assert job_old is not None
        assert job_old["result_bytes"] is None
    finally:
        background_jobs._jobs.clear()
        background_jobs._active_workspaces.clear()
