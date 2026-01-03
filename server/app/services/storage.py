from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

BASE_DATA = Path(__file__).resolve().parent.parent / "data"
BASE_DATA.mkdir(exist_ok=True)

# Accept hex IDs (default) and human-friendly IDs (tests/dev), alnum plus _ or -.
_WORKSPACE_ID_RE = re.compile(r"^[0-9A-Za-z_-]{3,64}$")


class InvalidWorkspaceId(ValueError):
    pass


def validate_workspace_id(workspace_id: str) -> None:
    if not _WORKSPACE_ID_RE.fullmatch(workspace_id or ""):
        raise InvalidWorkspaceId("Invalid workspace_id")


def new_workspace_id() -> str:
    return uuid4().hex


def workspace_dir(workspace_id: str) -> Path:
    validate_workspace_id(workspace_id)
    root = BASE_DATA / workspace_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def workspace_path(workspace_id: str) -> Path:
    """Return workspace path without creating it."""
    validate_workspace_id(workspace_id)
    return BASE_DATA / workspace_id


def _meta_path(workspace_id: str) -> Path:
    return workspace_path(workspace_id) / "meta.json"


def read_workspace_meta(workspace_id: str) -> dict:
    path = _meta_path(workspace_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def _write_workspace_meta(workspace_id: str, meta: dict) -> None:
    root = workspace_dir(workspace_id)
    path = root / "meta.json"
    tmp = root / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def touch_workspace(workspace_id: str) -> None:
    """Mark workspace as active and clear any pending end-session request."""
    meta = read_workspace_meta(workspace_id)
    meta["last_seen"] = time.time()
    meta.pop("end_requested_at", None)
    _write_workspace_meta(workspace_id, meta)


def request_end_session(workspace_id: str) -> None:
    """Request that a workspace be deleted soon (after a grace period)."""
    root = workspace_path(workspace_id)
    if not root.exists():
        return
    meta = read_workspace_meta(workspace_id)
    meta["end_requested_at"] = time.time()
    # Keep last_seen if present; don't create one on end-session.
    _write_workspace_meta(workspace_id, meta)


def delete_workspace(workspace_id: str) -> bool:
    """Delete the on-disk workspace folder, returning True if removed."""
    root = workspace_path(workspace_id)
    if not root.exists():
        return False
    # Extra safety: ensure we're deleting a direct child of BASE_DATA.
    if root.parent.resolve() != BASE_DATA.resolve():
        return False
    shutil.rmtree(root, ignore_errors=True)
    return not root.exists()


def list_workspace_ids() -> list[str]:
    ids: list[str] = []
    for child in BASE_DATA.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        if _WORKSPACE_ID_RE.fullmatch(name):
            ids.append(name)
    return ids


def clear_all_workspaces() -> int:
    """Delete all on-disk workspaces under BASE_DATA.

    Intended for local/dev usage.
    """
    deleted = 0
    for wid in list_workspace_ids():
        if delete_workspace(wid):
            deleted += 1
    return deleted


def save_upload(workspace_id: str, filename: str, fileobj: BinaryIO) -> Path:
    target_dir = workspace_dir(workspace_id)
    target = target_dir / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as f:
        f.write(fileobj.read())
    return target


def list_files(workspace_id: str, subdir: str) -> list[Path]:
    root = workspace_dir(workspace_id) / subdir
    if not root.exists():
        return []
    return [p for p in root.iterdir() if p.is_file()]
