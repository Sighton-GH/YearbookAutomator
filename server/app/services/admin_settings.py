from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.storage import BASE_DATA


_SETTINGS_DIR = BASE_DATA / "_settings"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"


@dataclass(frozen=True)
class FaceDetectionSettings:
    admin_username: str = "admin"
    enable_yunet: bool = False
    enable_background_removal_ops: bool = False
    enable_center_on_face_ops: bool = False
    admin_idle_timeout_seconds: int = 900
    admin_max_session_seconds: int = 28800
    tool_session_timeout_seconds: int = 28800
    retinaface_model_path: str = ""
    retinaface_input_size: int = 640
    retinaface_confidence: float = 0.7
    yunet_model_path: str = ""
    yunet_input_size: int = 320
    yunet_score_threshold: float = 0.7

    @property
    def enable_heavy_generation_ops(self) -> bool:
        return bool(self.enable_background_removal_ops and self.enable_center_on_face_ops)


_DEFAULT_YUNET_PATH = str((Path(__file__).resolve().parents[2] / "models" / "face" / "face_detection_yunet_2023mar.onnx"))
DEFAULT_SETTINGS = FaceDetectionSettings(
    admin_username=(os.getenv("YMGA_LICENSE_ADMIN_USERNAME", "admin") or "admin").strip() or "admin",
    yunet_model_path=_DEFAULT_YUNET_PATH,
    admin_idle_timeout_seconds=max(60, int(os.getenv("YMGA_ADMIN_IDLE_TIMEOUT_SECONDS", "900") or "900")),
    admin_max_session_seconds=max(60, int(os.getenv("YMGA_ADMIN_MAX_SESSION_SECONDS", "28800") or "28800")),
    tool_session_timeout_seconds=max(60, int(os.getenv("YMGA_TOOL_SESSION_TIMEOUT_SECONDS", "28800") or "28800")),
)


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_non_empty_str(value: Any, default: str) -> str:
    text = str(value or "").strip()
    return text or default


def _coerce_timeout(value: Any, default: int, *, minimum: int = 60) -> int:
    out = _coerce_int(value, default)
    if out < minimum:
        return minimum
    return out


def _read_raw() -> dict:
    if not _SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(_SETTINGS_PATH.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def get_face_detection_settings() -> FaceDetectionSettings:
    raw = _read_raw()
    yunet_default = DEFAULT_SETTINGS.yunet_model_path
    if yunet_default and not Path(yunet_default).exists():
        yunet_default = ""

    legacy_heavy = _coerce_bool(raw.get("enable_heavy_generation_ops", False))
    bg_enabled = _coerce_bool(raw.get("enable_background_removal_ops", legacy_heavy))
    center_enabled = _coerce_bool(raw.get("enable_center_on_face_ops", legacy_heavy))

    idle_timeout = _coerce_timeout(
        raw.get("admin_idle_timeout_seconds", DEFAULT_SETTINGS.admin_idle_timeout_seconds),
        DEFAULT_SETTINGS.admin_idle_timeout_seconds,
        minimum=60,
    )
    max_timeout = _coerce_timeout(
        raw.get("admin_max_session_seconds", DEFAULT_SETTINGS.admin_max_session_seconds),
        DEFAULT_SETTINGS.admin_max_session_seconds,
        minimum=idle_timeout,
    )
    tool_timeout = _coerce_timeout(
        raw.get("tool_session_timeout_seconds", DEFAULT_SETTINGS.tool_session_timeout_seconds),
        DEFAULT_SETTINGS.tool_session_timeout_seconds,
        minimum=60,
    )

    return FaceDetectionSettings(
        admin_username=_coerce_non_empty_str(raw.get("admin_username", DEFAULT_SETTINGS.admin_username), DEFAULT_SETTINGS.admin_username),
        enable_yunet=_coerce_bool(raw.get("enable_yunet", DEFAULT_SETTINGS.enable_yunet)),
        enable_background_removal_ops=bg_enabled,
        enable_center_on_face_ops=center_enabled,
        admin_idle_timeout_seconds=idle_timeout,
        admin_max_session_seconds=max_timeout,
        tool_session_timeout_seconds=tool_timeout,
        retinaface_model_path=str(raw.get("retinaface_model_path", DEFAULT_SETTINGS.retinaface_model_path) or ""),
        retinaface_input_size=_coerce_int(raw.get("retinaface_input_size", DEFAULT_SETTINGS.retinaface_input_size), DEFAULT_SETTINGS.retinaface_input_size),
        retinaface_confidence=_coerce_float(raw.get("retinaface_confidence", DEFAULT_SETTINGS.retinaface_confidence), DEFAULT_SETTINGS.retinaface_confidence),
        yunet_model_path=str(raw.get("yunet_model_path", yunet_default) or ""),
        yunet_input_size=_coerce_int(raw.get("yunet_input_size", DEFAULT_SETTINGS.yunet_input_size), DEFAULT_SETTINGS.yunet_input_size),
        yunet_score_threshold=_coerce_float(raw.get("yunet_score_threshold", DEFAULT_SETTINGS.yunet_score_threshold), DEFAULT_SETTINGS.yunet_score_threshold),
    )


def update_face_detection_settings(updates: dict) -> FaceDetectionSettings:
    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    raw = _read_raw()
    raw.update(updates)
    _SETTINGS_PATH.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    return get_face_detection_settings()
