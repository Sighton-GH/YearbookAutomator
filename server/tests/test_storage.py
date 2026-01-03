from app.services import storage


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
