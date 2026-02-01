from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.storage import BASE_DATA


_SETTINGS_DIR = BASE_DATA / "_settings"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"


@dataclass(frozen=True)
class FaceDetectionSettings:
    enable_yunet: bool = False
    retinaface_model_path: str = ""
    retinaface_input_size: int = 640
    retinaface_confidence: float = 0.7
    yunet_model_path: str = ""
    yunet_input_size: int = 320
    yunet_score_threshold: float = 0.7


_DEFAULT_YUNET_PATH = str((Path(__file__).resolve().parents[2] / "models" / "face" / "face_detection_yunet_2023mar.onnx"))
DEFAULT_SETTINGS = FaceDetectionSettings(yunet_model_path=_DEFAULT_YUNET_PATH)


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
    return FaceDetectionSettings(
        enable_yunet=_coerce_bool(raw.get("enable_yunet", DEFAULT_SETTINGS.enable_yunet)),
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
