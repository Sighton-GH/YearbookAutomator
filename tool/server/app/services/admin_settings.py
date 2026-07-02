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
    # Personal (free) license workspace-session timeout. Commercial licenses are
    # configured per-license on the Licenses admin page instead (see
    # `licensing.get_workspace_expiry_policy`).
    personal_workspace_timeout_seconds: int = 28800
    workspace_lock_timeout_seconds: int = 120
    workspace_heartbeat_interval_seconds: int = 20
    workspace_cleanup_interval_seconds: int = 60
    auto_delete_expired_workspaces: bool = True
    enable_admin_workspace_takeover: bool = True
    commercial_workspace_key_mode: str = "license_only"
    workspace_audit_retention_days: int = 30
    retinaface_model_path: str = ""
    retinaface_input_size: int = 640
    retinaface_confidence: float = 0.7
    yunet_model_path: str = ""
    yunet_input_size: int = 320
    yunet_score_threshold: float = 0.7

    # --- Performance & resource limits ---
    # Network: caps the byte throughput of incoming uploads / outgoing downloads
    # across the whole server. 0 means unlimited.
    network_upload_limit_kbps: int = 0
    network_download_limit_kbps: int = 0
    # CPU: `cpu_max_threads` caps OpenCV/ONNX Runtime worker threads (0 = auto/all
    # cores). `cpu_throttle_percent` inserts idle gaps into heavy per-item loops so
    # sustained CPU load stays near the target percent (100 = no throttling).
    cpu_max_threads: int = 0
    cpu_throttle_percent: int = 100
    # Lowers the backend process's OS scheduling priority so other apps (e.g. a
    # game) get preferential CPU time under contention. Best-effort; some
    # platforms require elevated permissions to raise priority back to normal
    # once lowered within the same process lifetime (a restart always resets it).
    cpu_low_priority: bool = False
    # GPU: `gpu_disabled` forces CPU-only inference providers everywhere.
    # `gpu_throttle_percent` paces GPU-bound calls like `cpu_throttle_percent`.
    # `gpu_max_concurrent_ops` bounds how many GPU inferences can run at once
    # (0 = auto default sizing).
    gpu_disabled: bool = False
    gpu_throttle_percent: int = 100
    gpu_max_concurrent_ops: int = 0

    # --- Tool feature toggles ---
    # These gate pre-existing, currently-always-available tool features (unlike
    # the background-removal/center-on-face toggles above, which default OFF).
    # Default True so behavior is unchanged until an admin explicitly disables one.
    enable_quotes_feature: bool = True
    enable_baby_photos_feature: bool = True
    enable_pdf_output: bool = True
    enable_tiff_output: bool = True
    enable_alphabetical_sort_option: bool = True
    enable_advanced_name_matching: bool = True
    enable_custom_font_upload: bool = True

    @property
    def enable_heavy_generation_ops(self) -> bool:
        return bool(self.enable_background_removal_ops and self.enable_center_on_face_ops)


_DEFAULT_YUNET_PATH = str((Path(__file__).resolve().parents[2] / "models" / "face" / "face_detection_yunet_2023mar.onnx"))
DEFAULT_SETTINGS = FaceDetectionSettings(
    admin_username=(os.getenv("YMGA_LICENSE_ADMIN_USERNAME", "admin") or "admin").strip() or "admin",
    yunet_model_path=_DEFAULT_YUNET_PATH,
    admin_idle_timeout_seconds=max(60, int(os.getenv("YMGA_ADMIN_IDLE_TIMEOUT_SECONDS", "900") or "900")),
    admin_max_session_seconds=max(60, int(os.getenv("YMGA_ADMIN_MAX_SESSION_SECONDS", "28800") or "28800")),
    personal_workspace_timeout_seconds=max(
        60,
        int(
            os.getenv(
                "YMGA_PERSONAL_WORKSPACE_TIMEOUT_SECONDS",
                os.getenv("YMGA_TOOL_SESSION_TIMEOUT_SECONDS", "28800"),
            )
            or "28800"
        ),
    ),
    workspace_lock_timeout_seconds=max(30, int(os.getenv("YMGA_WORKSPACE_LOCK_TIMEOUT_SECONDS", "120") or "120")),
    workspace_heartbeat_interval_seconds=max(5, int(os.getenv("YMGA_WORKSPACE_HEARTBEAT_INTERVAL_SECONDS", "20") or "20")),
    workspace_cleanup_interval_seconds=max(10, int(os.getenv("YMGA_WORKSPACE_CLEANUP_INTERVAL_SECONDS", "60") or "60")),
    auto_delete_expired_workspaces=(os.getenv("YMGA_AUTO_DELETE_EXPIRED_WORKSPACES", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_admin_workspace_takeover=(os.getenv("YMGA_ENABLE_ADMIN_WORKSPACE_TAKEOVER", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    commercial_workspace_key_mode=(os.getenv("YMGA_COMMERCIAL_WORKSPACE_KEY_MODE", "license_only") or "license_only").strip().lower(),
    workspace_audit_retention_days=max(1, int(os.getenv("YMGA_WORKSPACE_AUDIT_RETENTION_DAYS", "30") or "30")),
    network_upload_limit_kbps=max(0, int(os.getenv("YMGA_NETWORK_UPLOAD_LIMIT_KBPS", "0") or "0")),
    network_download_limit_kbps=max(0, int(os.getenv("YMGA_NETWORK_DOWNLOAD_LIMIT_KBPS", "0") or "0")),
    cpu_max_threads=max(0, int(os.getenv("YMGA_CPU_MAX_THREADS", "0") or "0")),
    cpu_throttle_percent=min(100, max(1, int(os.getenv("YMGA_CPU_THROTTLE_PERCENT", "100") or "100"))),
    cpu_low_priority=(os.getenv("YMGA_CPU_LOW_PRIORITY", "false") or "false").strip().lower() in {"1", "true", "yes", "on"},
    gpu_disabled=(os.getenv("YMGA_GPU_DISABLED", "false") or "false").strip().lower() in {"1", "true", "yes", "on"},
    gpu_throttle_percent=min(100, max(1, int(os.getenv("YMGA_GPU_THROTTLE_PERCENT", "100") or "100"))),
    gpu_max_concurrent_ops=max(0, int(os.getenv("YMGA_GPU_MAX_CONCURRENT_OPS", "0") or "0")),
    enable_quotes_feature=(os.getenv("YMGA_ENABLE_QUOTES_FEATURE", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_baby_photos_feature=(os.getenv("YMGA_ENABLE_BABY_PHOTOS_FEATURE", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_pdf_output=(os.getenv("YMGA_ENABLE_PDF_OUTPUT", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_tiff_output=(os.getenv("YMGA_ENABLE_TIFF_OUTPUT", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_alphabetical_sort_option=(os.getenv("YMGA_ENABLE_ALPHABETICAL_SORT_OPTION", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_advanced_name_matching=(os.getenv("YMGA_ENABLE_ADVANCED_NAME_MATCHING", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
    enable_custom_font_upload=(os.getenv("YMGA_ENABLE_CUSTOM_FONT_UPLOAD", "true") or "true").strip().lower() in {"1", "true", "yes", "on"},
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


def _coerce_choice(value: Any, default: str, *, allowed: set[str]) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in allowed:
        return candidate
    return default


def _coerce_percent(value: Any, default: int) -> int:
    out = _coerce_int(value, default)
    return min(100, max(1, out))


def _coerce_non_negative_int(value: Any, default: int) -> int:
    out = _coerce_int(value, default)
    return max(0, out)


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
    personal_workspace_timeout = _coerce_timeout(
        raw.get(
            "personal_workspace_timeout_seconds",
            raw.get("tool_session_timeout_seconds", DEFAULT_SETTINGS.personal_workspace_timeout_seconds),
        ),
        DEFAULT_SETTINGS.personal_workspace_timeout_seconds,
        minimum=60,
    )
    lock_timeout = _coerce_timeout(
        raw.get("workspace_lock_timeout_seconds", DEFAULT_SETTINGS.workspace_lock_timeout_seconds),
        DEFAULT_SETTINGS.workspace_lock_timeout_seconds,
        minimum=30,
    )
    heartbeat_interval = _coerce_timeout(
        raw.get("workspace_heartbeat_interval_seconds", DEFAULT_SETTINGS.workspace_heartbeat_interval_seconds),
        DEFAULT_SETTINGS.workspace_heartbeat_interval_seconds,
        minimum=5,
    )
    cleanup_interval = _coerce_timeout(
        raw.get("workspace_cleanup_interval_seconds", DEFAULT_SETTINGS.workspace_cleanup_interval_seconds),
        DEFAULT_SETTINGS.workspace_cleanup_interval_seconds,
        minimum=10,
    )
    audit_retention_days = _coerce_timeout(
        raw.get("workspace_audit_retention_days", DEFAULT_SETTINGS.workspace_audit_retention_days),
        DEFAULT_SETTINGS.workspace_audit_retention_days,
        minimum=1,
    )
    key_mode = _coerce_choice(
        raw.get("commercial_workspace_key_mode", DEFAULT_SETTINGS.commercial_workspace_key_mode),
        DEFAULT_SETTINGS.commercial_workspace_key_mode,
        allowed={"license_only", "license_and_device"},
    )

    return FaceDetectionSettings(
        admin_username=_coerce_non_empty_str(raw.get("admin_username", DEFAULT_SETTINGS.admin_username), DEFAULT_SETTINGS.admin_username),
        enable_yunet=_coerce_bool(raw.get("enable_yunet", DEFAULT_SETTINGS.enable_yunet)),
        enable_background_removal_ops=bg_enabled,
        enable_center_on_face_ops=center_enabled,
        admin_idle_timeout_seconds=idle_timeout,
        admin_max_session_seconds=max_timeout,
        personal_workspace_timeout_seconds=personal_workspace_timeout,
        workspace_lock_timeout_seconds=lock_timeout,
        workspace_heartbeat_interval_seconds=heartbeat_interval,
        workspace_cleanup_interval_seconds=cleanup_interval,
        auto_delete_expired_workspaces=_coerce_bool(raw.get("auto_delete_expired_workspaces", DEFAULT_SETTINGS.auto_delete_expired_workspaces)),
        enable_admin_workspace_takeover=_coerce_bool(raw.get("enable_admin_workspace_takeover", DEFAULT_SETTINGS.enable_admin_workspace_takeover)),
        commercial_workspace_key_mode=key_mode,
        workspace_audit_retention_days=audit_retention_days,
        retinaface_model_path=str(raw.get("retinaface_model_path", DEFAULT_SETTINGS.retinaface_model_path) or ""),
        retinaface_input_size=_coerce_int(raw.get("retinaface_input_size", DEFAULT_SETTINGS.retinaface_input_size), DEFAULT_SETTINGS.retinaface_input_size),
        retinaface_confidence=_coerce_float(raw.get("retinaface_confidence", DEFAULT_SETTINGS.retinaface_confidence), DEFAULT_SETTINGS.retinaface_confidence),
        yunet_model_path=str(raw.get("yunet_model_path", yunet_default) or ""),
        yunet_input_size=_coerce_int(raw.get("yunet_input_size", DEFAULT_SETTINGS.yunet_input_size), DEFAULT_SETTINGS.yunet_input_size),
        yunet_score_threshold=_coerce_float(raw.get("yunet_score_threshold", DEFAULT_SETTINGS.yunet_score_threshold), DEFAULT_SETTINGS.yunet_score_threshold),
        network_upload_limit_kbps=_coerce_non_negative_int(raw.get("network_upload_limit_kbps", DEFAULT_SETTINGS.network_upload_limit_kbps), DEFAULT_SETTINGS.network_upload_limit_kbps),
        network_download_limit_kbps=_coerce_non_negative_int(raw.get("network_download_limit_kbps", DEFAULT_SETTINGS.network_download_limit_kbps), DEFAULT_SETTINGS.network_download_limit_kbps),
        cpu_max_threads=_coerce_non_negative_int(raw.get("cpu_max_threads", DEFAULT_SETTINGS.cpu_max_threads), DEFAULT_SETTINGS.cpu_max_threads),
        cpu_throttle_percent=_coerce_percent(raw.get("cpu_throttle_percent", DEFAULT_SETTINGS.cpu_throttle_percent), DEFAULT_SETTINGS.cpu_throttle_percent),
        cpu_low_priority=_coerce_bool(raw.get("cpu_low_priority", DEFAULT_SETTINGS.cpu_low_priority)),
        gpu_disabled=_coerce_bool(raw.get("gpu_disabled", DEFAULT_SETTINGS.gpu_disabled)),
        gpu_throttle_percent=_coerce_percent(raw.get("gpu_throttle_percent", DEFAULT_SETTINGS.gpu_throttle_percent), DEFAULT_SETTINGS.gpu_throttle_percent),
        gpu_max_concurrent_ops=_coerce_non_negative_int(raw.get("gpu_max_concurrent_ops", DEFAULT_SETTINGS.gpu_max_concurrent_ops), DEFAULT_SETTINGS.gpu_max_concurrent_ops),
        enable_quotes_feature=_coerce_bool(raw.get("enable_quotes_feature", DEFAULT_SETTINGS.enable_quotes_feature)),
        enable_baby_photos_feature=_coerce_bool(raw.get("enable_baby_photos_feature", DEFAULT_SETTINGS.enable_baby_photos_feature)),
        enable_pdf_output=_coerce_bool(raw.get("enable_pdf_output", DEFAULT_SETTINGS.enable_pdf_output)),
        enable_tiff_output=_coerce_bool(raw.get("enable_tiff_output", DEFAULT_SETTINGS.enable_tiff_output)),
        enable_alphabetical_sort_option=_coerce_bool(raw.get("enable_alphabetical_sort_option", DEFAULT_SETTINGS.enable_alphabetical_sort_option)),
        enable_advanced_name_matching=_coerce_bool(raw.get("enable_advanced_name_matching", DEFAULT_SETTINGS.enable_advanced_name_matching)),
        enable_custom_font_upload=_coerce_bool(raw.get("enable_custom_font_upload", DEFAULT_SETTINGS.enable_custom_font_upload)),
    )


def update_face_detection_settings(updates: dict) -> FaceDetectionSettings:
    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    raw = _read_raw()
    raw.update(updates)
    _SETTINGS_PATH.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    return get_face_detection_settings()
