import asyncio
import os
import time

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.services import background_jobs, storage, workspace_cleanup
from app.services.editor_images import cleanup_editor_images, cleanup_stale_previews


def image_files(tmp_path, monkeypatch, names):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    folder = storage.workspace_file("editor-test", "baby", "original.png").parent
    folder.mkdir(parents=True, exist_ok=True)
    for name in names:
        (folder / name).write_bytes(b"generated placeholder")
    return folder


def test_three_previews_two_applies_keep_original_and_current(tmp_path, monkeypatch):
    folder = image_files(tmp_path, monkeypatch, ["original.png"])
    for i in range(3):
        name = f"baby_preview_{i}.png"
        (folder / name).write_bytes(b"preview")
        assert cleanup_editor_images("editor-test", [name], []) == 1
    for i in range(2):
        name = f"baby_edit_{i}.png"
        (folder / name).write_bytes(b"edit")
        if i:
            assert cleanup_editor_images("editor-test", ["baby_edit_0.png"], [name, "original.png"]) == 1
    assert sorted(p.name for p in folder.iterdir()) == ["baby_edit_1.png", "original.png"]


def test_history_other_person_and_original_are_protected(tmp_path, monkeypatch):
    names = ["original.png", "baby_edit_history.png", "baby_edit_other.png", "baby_edit_current.png"]
    folder = image_files(tmp_path, monkeypatch, names)
    assert cleanup_editor_images("editor-test", names + ["../outside.png"], names[1:]) == 0
    assert sorted(p.name for p in folder.iterdir()) == sorted(names)


def test_janitor_removes_only_old_temp_files_even_when_expiry_disabled(tmp_path, monkeypatch):
    names = ["original.png", "baby_edit_old.png", "baby_preview_old.png", "baby_preview_new.png"]
    folder = image_files(tmp_path, monkeypatch, names)
    now = time.time()
    for name in names[:3]:
        os.utime(folder / name, (now - 3601, now - 3601))
    monkeypatch.setattr(workspace_cleanup, "read_workspace_meta", lambda _: {"workspace_expiry_disabled": True})
    assert workspace_cleanup.run_cleanup_once(workspace_cleanup.CleanupConfig()) == 0
    assert sorted(p.name for p in folder.iterdir()) == sorted([names[0], names[1], names[3]])


def test_janitor_leaves_running_job_source_until_cancelled(tmp_path, monkeypatch):
    folder = image_files(tmp_path, monkeypatch, ["baby_preview_active.png"])
    os.utime(folder / "baby_preview_active.png", (0, 0))
    background_jobs.start_job("cleanup-active", "editor-test", kind="baby", source_filename="baby_preview_active.png", mode="simple", output_filename="unused.png")
    try:
        assert cleanup_stale_previews("editor-test") == 0
        background_jobs.update_job("cleanup-active", status="cancelled")
        assert cleanup_stale_previews("editor-test") == 1
    finally:
        background_jobs.update_job("cleanup-active", status="done")


def test_cleanup_endpoint_requires_write_access(monkeypatch):
    from app.routes import editor_images
    def denied(*args):
        raise HTTPException(403)
    monkeypatch.setattr(editor_images, "enforce_workspace_write", denied)
    request = Request({"type": "http", "headers": []})
    with pytest.raises(HTTPException):
        asyncio.run(editor_images.cleanup(editor_images.EditorImageCleanup(workspace_id="editor-test"), request))


def test_cleanup_skips_invalid_candidate_and_server_references(tmp_path, monkeypatch):
    from app.services import storage
    from app.services.editor_images import cleanup_editor_images
    monkeypatch.setattr(storage,'BASE_DATA',tmp_path)
    root=storage.workspace_dir('fictional-ref')
    folder=root/'baby';folder.mkdir(exist_ok=True)
    for name in ['baby_edit_keep.png','baby_preview_delete.png']:(folder/name).write_bytes(b'fictional')
    storage.merge_workspace_meta('fictional-ref',{'tool_state':{'people':[{'baby_photo_filename':'baby_edit_keep.png'}]}})
    assert cleanup_editor_images('fictional-ref',['baby_edit_../bad.png','baby_edit_keep.png','baby_preview_delete.png'],[]) == 1
    assert (folder/'baby_edit_keep.png').exists()
