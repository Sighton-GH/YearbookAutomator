from pathlib import Path

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def list_asset_names(root: Path, kind: str) -> list[str]:
    folders = ("mugshots", "mugshot") if kind == "mugshot" else ("baby",)
    names = set()
    for folder in folders:
        directory = root / folder
        if not directory.is_dir():
            continue
        for path in directory.iterdir():
            # Do not advertise symlinks, nested files, or non-image files.
            if path.is_file() and not path.is_symlink() and path.suffix.lower() in IMAGE_EXTENSIONS:
                names.add(path.name)
    return sorted(names, key=lambda name: (name.casefold(), name))
