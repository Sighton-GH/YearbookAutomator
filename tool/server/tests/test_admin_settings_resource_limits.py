from __future__ import annotations

from app.services import admin_settings


def _isolate(monkeypatch, tmp_path):
    """Redirect settings persistence to a tmp dir so tests never touch real data.

    `admin_settings._SETTINGS_DIR` / `_SETTINGS_PATH` are computed once at
    import time from `storage.BASE_DATA` and are NOT live references, so
    monkeypatching `storage.BASE_DATA` alone would not redirect them.
    """

    settings_dir = tmp_path / "_settings"
    monkeypatch.setattr(admin_settings, "_SETTINGS_DIR", settings_dir)
    monkeypatch.setattr(admin_settings, "_SETTINGS_PATH", settings_dir / "settings.json")


def test_resource_limit_defaults(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    s = admin_settings.get_face_detection_settings()
    assert s.network_upload_limit_kbps == 25_000
    assert s.network_download_limit_kbps == 50_000
    assert s.cpu_max_threads == 4
    assert s.cpu_throttle_percent == 85
    assert s.cpu_low_priority is True
    assert s.gpu_disabled is False
    assert s.gpu_throttle_percent == 90
    assert s.gpu_max_concurrent_ops == 1


def test_tool_feature_toggle_defaults(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    s = admin_settings.get_face_detection_settings()
    assert s.enable_quotes_feature is True
    assert s.enable_baby_photos_feature is True
    assert s.enable_pdf_output is True
    assert s.enable_tiff_output is True
    assert s.enable_alphabetical_sort_option is True
    assert s.enable_advanced_name_matching is True
    assert s.enable_custom_font_upload is True


def test_tool_feature_toggle_round_trip(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    admin_settings.update_face_detection_settings(
        {
            "enable_quotes_feature": False,
            "enable_baby_photos_feature": False,
            "enable_pdf_output": False,
            "enable_tiff_output": False,
            "enable_alphabetical_sort_option": False,
            "enable_advanced_name_matching": False,
            "enable_custom_font_upload": False,
        }
    )

    s = admin_settings.get_face_detection_settings()
    assert s.enable_quotes_feature is False
    assert s.enable_baby_photos_feature is False
    assert s.enable_pdf_output is False
    assert s.enable_tiff_output is False
    assert s.enable_alphabetical_sort_option is False
    assert s.enable_advanced_name_matching is False
    assert s.enable_custom_font_upload is False


def test_resource_limit_round_trip(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    admin_settings.update_face_detection_settings(
        {
            "network_upload_limit_kbps": 512,
            "network_download_limit_kbps": 1024,
            "cpu_max_threads": 4,
            "cpu_throttle_percent": 50,
            "cpu_low_priority": True,
            "gpu_disabled": True,
            "gpu_throttle_percent": 25,
            "gpu_max_concurrent_ops": 2,
        }
    )

    s = admin_settings.get_face_detection_settings()
    assert s.network_upload_limit_kbps == 512
    assert s.network_download_limit_kbps == 1024
    assert s.cpu_max_threads == 4
    assert s.cpu_throttle_percent == 50
    assert s.cpu_low_priority is True
    assert s.gpu_disabled is True
    assert s.gpu_throttle_percent == 25
    assert s.gpu_max_concurrent_ops == 2


def test_resource_limit_coercion_clamps_invalid_values(monkeypatch, tmp_path):
    _isolate(monkeypatch, tmp_path)

    admin_settings.update_face_detection_settings(
        {
            "network_upload_limit_kbps": -50,
            "cpu_max_threads": -3,
            "cpu_throttle_percent": 500,
            "gpu_throttle_percent": 0,
            "gpu_max_concurrent_ops": "not-a-number",
        }
    )

    s = admin_settings.get_face_detection_settings()
    # Negative values clamp to 0 ("unlimited"/"auto").
    assert s.network_upload_limit_kbps == 0
    assert s.cpu_max_threads == 0
    # Percent fields clamp to [1, 100].
    assert s.cpu_throttle_percent == 100
    assert s.gpu_throttle_percent == 1
    # Unparsable values fall back to the previous/default value.
    assert s.gpu_max_concurrent_ops == 1


def test_resource_limits_fall_back_to_configured_defaults(monkeypatch, tmp_path):
    """When nothing is persisted yet, settings should fall back to `DEFAULT_SETTINGS`

    (which is where env-var-configured defaults like `YMGA_CPU_THROTTLE_PERCENT`
    are baked in at process startup). Monkeypatching `DEFAULT_SETTINGS` directly
    exercises that fallback wiring without reloading the shared module (which
    would risk leaking state into other test files).
    """

    _isolate(monkeypatch, tmp_path)

    custom_defaults = admin_settings.FaceDetectionSettings(
        network_upload_limit_kbps=256,
        cpu_throttle_percent=40,
        gpu_disabled=True,
    )
    monkeypatch.setattr(admin_settings, "DEFAULT_SETTINGS", custom_defaults)

    s = admin_settings.get_face_detection_settings()
    assert s.network_upload_limit_kbps == 256
    assert s.cpu_throttle_percent == 40
    assert s.gpu_disabled is True
