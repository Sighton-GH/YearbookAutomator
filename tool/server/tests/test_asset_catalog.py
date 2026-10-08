from app.services.asset_catalog import list_asset_names


def test_asset_catalog_images_only_legacy_and_sorted(tmp_path):
    for folder in ("mugshots", "mugshot", "baby"):
        (tmp_path / folder).mkdir()
    for folder, name in (("mugshots", "B.PNG"), ("mugshots", "a.jpg"), ("mugshots", "notes.txt"), ("mugshot", "a.jpg"), ("baby", "infant.png")):
        (tmp_path / folder / name).write_bytes(b"fictional")
    (tmp_path / "mugshots" / "nested.png").mkdir()
    (tmp_path / "mugshots" / "link.png").symlink_to(tmp_path / "baby" / "infant.png")
    assert list_asset_names(tmp_path, "mugshot") == ["a.jpg", "B.PNG"]
    assert list_asset_names(tmp_path, "baby") == ["infant.png"]
