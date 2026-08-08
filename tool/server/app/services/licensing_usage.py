import json
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

from app.services.storage import BASE_DATA


@dataclass(frozen=True)
class UsageEvent:
    ts: int
    key: str
    license_type: str
    ip: str | None
    device_id: str | None
    route: str | None


_LOCK = Lock()


def _root_dir() -> Path:
    # Use the same root as licensing.py (data/_licenses) without importing it to avoid cycles.
    # (Both share YMGA_LICENSE_STORE_DIR override semantics.)
    import os

    override = os.getenv("YMGA_LICENSE_STORE_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return BASE_DATA / "_licenses"


def _usage_path() -> Path:
    return _root_dir() / "usage.json"


def _ensure_dir() -> None:
    root = _root_dir()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass


def _key_label(key: str) -> str:
    normalized = (key or "").strip().upper()
    if len(normalized) <= 18:
        return normalized
    return f"{normalized[:10]}…{normalized[-4:]}"


def load_usage_events() -> list[dict[str, Any]]:
    _ensure_dir()
    p = _usage_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_usage_events(events: list[dict[str, Any]]) -> None:
    _ensure_dir()
    p = _usage_path()
    tmp = p.with_suffix(p.suffix + ".tmp")
    sanitized = [{**event, "key": _key_label(str(event.get("key") or ""))} for event in events]
    tmp.write_text(json.dumps(sanitized, indent=2, sort_keys=True), encoding="utf-8")
    try:
        tmp.chmod(0o600)
    except OSError:
        pass
    tmp.replace(p)


def append_usage_event(*, key: str, license_type: str, ip: str | None, device_id: str | None, route: str | None) -> None:
    ts = int(time.time())
    ev = {
        "ts": ts,
        "key": _key_label(key),
        "license_type": license_type,
        "ip": ip,
        "device_id": device_id,
        "route": route,
    }

    with _LOCK:
        events = load_usage_events()
        events.append(ev)
        # Keep only the 2000 most recent.
        if len(events) > 2000:
            events = events[-2000:]
        save_usage_events(events)


def get_recent_usage(limit: int = 500) -> list[dict[str, Any]]:
    with _LOCK:
        events = load_usage_events()
        if limit <= 0:
            return []
        return list(reversed(events[-min(limit, len(events)) :]))
