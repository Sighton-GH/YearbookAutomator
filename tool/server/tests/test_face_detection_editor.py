from PIL import Image

from app.services.admin_settings import FaceDetectionSettings
from app.services import face_detection as fd


def test_detect_face_center_for_editor_prefers_yunet_over_haar(monkeypatch):
    calls: list[str] = []

    monkeypatch.setattr(
        fd,
        "get_face_detection_settings",
        lambda: FaceDetectionSettings(
            retinaface_model_path="",
            yunet_model_path="dummy.onnx",
            yunet_input_size=320,
            yunet_score_threshold=0.7,
        ),
    )

    monkeypatch.setattr(fd, "_retinaface_pip_detect", lambda img, conf: [])

    def fake_yunet(img, model_path, input_size, score):
        calls.append("yunet")
        return [fd.FaceBox(x=10, y=20, w=30, h=40, score=0.9)]

    def fake_haar(img):
        calls.append("haar")
        return [fd.FaceBox(x=100, y=100, w=10, h=10, score=1.0)]

    monkeypatch.setattr(fd, "_yunet_detect_with_status", lambda img, model_path, input_size, score: (fake_yunet(img, model_path, input_size, score), True))
    monkeypatch.setattr(fd, "_haar_detect", fake_haar)

    center = fd.detect_face_center_for_editor(Image.new("RGB", (200, 200), "white"))

    assert center == (25.0, 40.0)
    assert "yunet" in calls
    assert "haar" not in calls


def test_detect_face_center_for_editor_uses_haar_when_yunet_misses(monkeypatch):
    monkeypatch.setattr(
        fd,
        "get_face_detection_settings",
        lambda: FaceDetectionSettings(
            retinaface_model_path="",
            yunet_model_path="dummy.onnx",
            yunet_input_size=320,
            yunet_score_threshold=0.7,
        ),
    )

    monkeypatch.setattr(fd, "_retinaface_pip_detect", lambda img, conf: [])
    monkeypatch.setattr(fd, "_yunet_detect_with_status", lambda img, model_path, input_size, score: ([], False))
    monkeypatch.setattr(fd, "_haar_detect", lambda img: [fd.FaceBox(x=6, y=8, w=20, h=10, score=1.0)])

    center = fd.detect_face_center_for_editor(Image.new("RGB", (120, 120), "white"))

    assert center == (16.0, 13.0)


def test_detect_face_center_for_editor_handles_rotated_detection(monkeypatch):
    monkeypatch.setattr(
        fd,
        "get_face_detection_settings",
        lambda: FaceDetectionSettings(
            retinaface_model_path="",
            yunet_model_path="dummy.onnx",
            yunet_input_size=320,
            yunet_score_threshold=0.7,
        ),
    )

    monkeypatch.setattr(fd, "_retinaface_pip_detect", lambda img, conf: [])
    monkeypatch.setattr(fd, "_yunet_detect_with_status", lambda img, model_path, input_size, score: (fake_yunet(img, model_path, input_size, score), True))

    def fake_yunet(img, model_path, input_size, score):
        # Original image is (300, 120). Rotating 90° CW yields (120, 300),
        # where this box corresponds to a face centered at (60, 60) in original.
        if img.size == (120, 300):
            return [fd.FaceBox(x=40, y=45, w=40, h=30, score=0.95)]
        return []

    monkeypatch.setattr(fd, "_haar_detect", lambda img: [])

    center = fd.detect_face_center_for_editor(Image.new("RGB", (300, 120), "white"))

    assert center is not None
    assert abs(center[0] - 60.0) < 0.01
    assert abs(center[1] - 60.0) < 0.01


def test_detect_face_center_for_editor_skips_haar_when_yunet_available(monkeypatch):
    monkeypatch.setattr(
        fd,
        "get_face_detection_settings",
        lambda: FaceDetectionSettings(
            retinaface_model_path="",
            yunet_model_path="dummy.onnx",
            yunet_input_size=320,
            yunet_score_threshold=0.7,
        ),
    )

    monkeypatch.setattr(fd, "_retinaface_pip_detect", lambda img, conf: [])
    monkeypatch.setattr(fd, "_yunet_detect_with_status", lambda img, model_path, input_size, score: ([], True))
    monkeypatch.setattr(fd, "_haar_detect", lambda img: [fd.FaceBox(x=6, y=8, w=20, h=10, score=1.0)])

    center = fd.detect_face_center_for_editor(Image.new("RGB", (120, 120), "white"))
    assert center is None
