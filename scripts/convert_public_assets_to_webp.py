from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class ConvertResult:
    src: Path
    dst: Path
    wrote: bool
    reason: str


def convert_to_webp(src: Path, *, quality: int = 82, method: int = 6) -> ConvertResult:
    if not src.is_file():
        return ConvertResult(src=src, dst=src.with_suffix(".webp"), wrote=False, reason="missing")

    if src.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        return ConvertResult(src=src, dst=src.with_suffix(".webp"), wrote=False, reason="skipped (ext)")

    dst = src.with_suffix(".webp")
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return ConvertResult(src=src, dst=dst, wrote=False, reason="up-to-date")

    with Image.open(src) as im:
        # Ensure Pillow writes the expected alpha/colour modes for WebP.
        if im.mode in {"P", "LA"}:
            im = im.convert("RGBA")
        elif im.mode not in {"RGB", "RGBA"}:
            im = im.convert("RGB")

        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, format="WEBP", quality=quality, method=method)

    return ConvertResult(src=src, dst=dst, wrote=True, reason="converted")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    assets_dir = repo_root / "web" / "public" / "assets"

    if not assets_dir.is_dir():
        raise SystemExit(f"Assets folder not found: {assets_dir}")

    targets = sorted([p for p in assets_dir.iterdir() if p.is_file()])

    results: list[ConvertResult] = []
    for src in targets:
        if src.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            results.append(convert_to_webp(src))

    wrote = [r for r in results if r.wrote]
    skipped = [r for r in results if not r.wrote]

    print(f"Converted: {len(wrote)} | Skipped: {len(skipped)}")
    for r in results:
        flag = "OK" if r.wrote else "--"
        print(f"{flag} {r.src.name} -> {r.dst.name} ({r.reason})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
