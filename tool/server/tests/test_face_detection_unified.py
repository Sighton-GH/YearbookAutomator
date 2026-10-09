"""P3-06: the editor and render-time face centring use one shared
detection-and-selection function, so a photo with several faces is centred
on the same face in both places."""

from PIL import Image

from app.services.admin_settings import FaceDetectionSettings
from app.services import face_detection as fd


def _patch_detectors(monkeypatch, yunet_boxes):
    """Route every backend to deterministic fakes; YuNet returns yunet_boxes."""
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
    monkeypatch.setattr(
        fd,
        "_yunet_detect_with_status",
        lambda img, model_path, input_size, score: (list(yunet_boxes), True),
    )
    monkeypatch.setattr(fd, "_haar_detect", lambda img: [])


# 200x200 image. Face A is the largest but sits in a corner; face B is smaller
# but dead centre. Both have the same score, so the centre-weighted selection
# picks B while the old render-time "largest face" pick would have picked A.
FACE_A = fd.FaceBox(x=10, y=10, w=40, h=40, score=0.9)   # corner, area 1600
FACE_B = fd.FaceBox(x=85, y=85, w=30, h=30, score=0.9)   # centre, area 900


def test_shared_detect_face_returns_box_center_and_meta(monkeypatch):
    _patch_detectors(monkeypatch, [FACE_A, FACE_B])

    detection = fd.detect_face(Image.new("RGB", (200, 200), "white"))

    assert detection is not None
    assert detection.box == FACE_B
    assert detection.center == (100.0, 100.0)
    assert detection.detector == "yunet"
    assert detection.rotation_cw == 0


def test_editor_and_generation_pick_the_same_face(monkeypatch):
    _patch_detectors(monkeypatch, [FACE_A, FACE_B])
    img = Image.new("RGB", (200, 200), "white")

    editor_box = fd.detect_face_box_for_editor(img)
    generation_box = fd.detect_face_box_for_generation(img)

    assert editor_box is not None
    assert editor_box == generation_box == FACE_B
    # The old render-time behaviour (largest face) would have picked FACE_A.
    assert generation_box != FACE_A


def test_editor_and_generation_return_the_same_center(monkeypatch):
    _patch_detectors(monkeypatch, [FACE_A, FACE_B])
    img = Image.new("RGB", (200, 200), "white")

    assert fd.detect_face_center_for_editor(img) == fd.detect_face_center_for_generation(img) == (100.0, 100.0)


def test_generator_render_path_uses_the_shared_pick(monkeypatch):
    _patch_detectors(monkeypatch, [FACE_A, FACE_B])

    from app.services.generator import detect_face_center

    # Same centre the editor would report for the same photo.
    assert detect_face_center(Image.new("RGB", (200, 200), "white")) == (100.0, 100.0)


def test_both_paths_return_none_when_no_face(monkeypatch):
    _patch_detectors(monkeypatch, [])
    img = Image.new("RGB", (200, 200), "white")

    assert fd.detect_face(img) is None
    assert fd.detect_face_box_for_editor(img) is None
    assert fd.detect_face_box_for_generation(img) is None
    assert fd.detect_face_center_for_editor(img) is None
    assert fd.detect_face_center_for_generation(img) is None


def test_generation_benefits_from_rotation_search(monkeypatch):
    """A face found only in a rotated orientation is now honoured at render
    time too, mapped back into original-image coordinates."""
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
    monkeypatch.setattr(fd, "_haar_detect", lambda img: [])

    def fake_yunet(img, model_path, input_size, score):
        # Original is (300, 120); only the 90-degree-CW rotation (120, 300)
        # "finds" a face, mirroring the existing editor rotation test.
        if img.size == (120, 300):
            return [fd.FaceBox(x=10, y=40, w=20, h=40, score=0.9)], True
        return [], True

    monkeypatch.setattr(fd, "_yunet_detect_with_status", fake_yunet)

    img = Image.new("RGB", (300, 120), "white")
    detection = fd.detect_face(img)

    assert detection is not None
    assert detection.rotation_cw == 90
    assert fd.detect_face_center_for_generation(img) == detection.center
