from __future__ import annotations

import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from app.services.admin_settings import get_face_detection_settings
from app.services import throttle


logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True)
class FaceBox:
    x: float
    y: float
    w: float
    h: float
    score: float


@dataclass(frozen=True)
class FaceDetection:
    """One selected face in an image: the shared result of detect_face().

    `box` and `center` are in original-image pixel coordinates. `detector`
    names the backend that produced the box ("yunet", "retinaface" or "haar")
    and `rotation_cw` is the clockwise rotation (0/90/180/270) of the image
    orientation the face was detected in.
    """

    box: FaceBox
    center: tuple[float, float]
    detector: str
    rotation_cw: int


_RETINA_SESSION: object | None = None
_RETINA_MODEL_PATH: str | None = None
_RETINA_INPUT_SIZE: int | None = None
_RETINA_PROVIDERS: list[str] | None = None
_RETINA_PIP_LOGGED = False

_YUNET: object | None = None
_YUNET_MODEL_PATH: str | None = None
_YUNET_INPUT_SIZE: int | None = None
_YUNET_SCORE: float | None = None


def _get_ort_providers() -> list[str] | None:
    if get_face_detection_settings().gpu_disabled:
        return ["CPUExecutionProvider"]

    forced = os.getenv("YMGA_FACE_PROVIDER", "").strip()
    try:
        import onnxruntime as ort  # type: ignore
    except Exception:
        return None

    available = ort.get_available_providers()
    if forced:
        wanted = [p.strip() for p in forced.split(",") if p.strip()]
        chosen = [p for p in wanted if p in available]
        return chosen if chosen else None

    # Prefer DirectML/CUDA if available.
    for p in ["DmlExecutionProvider", "CUDAExecutionProvider"]:
        if p in available:
            return [p, "CPUExecutionProvider"]
    if "CPUExecutionProvider" in available:
        return ["CPUExecutionProvider"]
    return None


def _load_retina_session(model_path: str, input_size: int) -> object | None:
    global _RETINA_SESSION, _RETINA_MODEL_PATH, _RETINA_INPUT_SIZE, _RETINA_PROVIDERS

    if not model_path:
        return None
    if not Path(model_path).exists():
        return None

    if _RETINA_SESSION is not None and _RETINA_MODEL_PATH == model_path and _RETINA_INPUT_SIZE == input_size:
        return _RETINA_SESSION

    try:
        import onnxruntime as ort  # type: ignore
    except Exception:
        return None

    providers = _get_ort_providers()
    try:
        sess_options = throttle.onnx_session_options()
        if sess_options is not None:
            _RETINA_SESSION = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
        else:
            _RETINA_SESSION = ort.InferenceSession(model_path, providers=providers)
        _RETINA_MODEL_PATH = model_path
        _RETINA_INPUT_SIZE = input_size
        _RETINA_PROVIDERS = providers
        logger.info("RetinaFace session providers: %s", providers or "default")
        return _RETINA_SESSION
    except Exception:
        _RETINA_SESSION = None
        return None


def _load_yunet(model_path: str, input_size: int, score_threshold: float) -> object | None:
    global _YUNET, _YUNET_MODEL_PATH, _YUNET_INPUT_SIZE, _YUNET_SCORE

    if not model_path:
        logger.warning("YuNet disabled: empty model path")
        return None
    if not Path(model_path).exists():
        logger.warning("YuNet model not found: %s", model_path)
        return None

    if (
        _YUNET is not None
        and _YUNET_MODEL_PATH == model_path
        and _YUNET_INPUT_SIZE == input_size
        and _YUNET_SCORE == score_threshold
    ):
        return _YUNET

    try:
        detector = cv2.FaceDetectorYN.create(model_path, "", (input_size, input_size))
        detector.setScoreThreshold(float(score_threshold))

        # Best-effort GPU backend selection (OpenCL / DirectML if available).
        backend = os.getenv("YMGA_YUNET_BACKEND", "").strip().upper()
        target = os.getenv("YMGA_YUNET_TARGET", "").strip().upper()

        def _apply_backend_target(b: int, t: int) -> None:
            try:
                detector.setBackend(b)
                detector.setTarget(t)
            except Exception:
                pass

        if backend and target and hasattr(cv2, f"DNN_BACKEND_{backend}") and hasattr(cv2, f"DNN_TARGET_{target}"):
            _apply_backend_target(getattr(cv2, f"DNN_BACKEND_{backend}"), getattr(cv2, f"DNN_TARGET_{target}"))
        else:
            # Prefer DirectML if available; otherwise try OpenCL.
            if hasattr(cv2, "DNN_BACKEND_DML") and hasattr(cv2, "DNN_TARGET_DML"):
                _apply_backend_target(cv2.DNN_BACKEND_DML, cv2.DNN_TARGET_DML)
            elif hasattr(cv2, "DNN_TARGET_OPENCL"):
                _apply_backend_target(cv2.DNN_BACKEND_OPENCV, cv2.DNN_TARGET_OPENCL)
            elif hasattr(cv2, "DNN_TARGET_OPENCL_FP16"):
                _apply_backend_target(cv2.DNN_BACKEND_OPENCV, cv2.DNN_TARGET_OPENCL_FP16)
    except Exception as exc:
        logger.warning("YuNet initialization failed (%s)", exc)
        return None

    _YUNET = detector
    _YUNET_MODEL_PATH = model_path
    _YUNET_INPUT_SIZE = input_size
    _YUNET_SCORE = score_threshold
    return detector


def _nms(boxes: list[FaceBox], iou_thresh: float = 0.4) -> list[FaceBox]:
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b.score, reverse=True)
    keep: list[FaceBox] = []

    def iou(a: FaceBox, b: FaceBox) -> float:
        ax0, ay0, ax1, ay1 = a.x, a.y, a.x + a.w, a.y + a.h
        bx0, by0, bx1, by1 = b.x, b.y, b.x + b.w, b.y + b.h
        ix0, iy0 = max(ax0, bx0), max(ay0, by0)
        ix1, iy1 = min(ax1, bx1), min(ay1, by1)
        iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
        inter = iw * ih
        if inter <= 0:
            return 0.0
        union = a.w * a.h + b.w * b.h - inter
        return inter / union if union > 0 else 0.0

    for b in boxes:
        if all(iou(b, k) < iou_thresh for k in keep):
            keep.append(b)
    return keep


def _generate_priors(image_size: int) -> np.ndarray:
    # Standard RetinaFace priors for 3 feature maps.
    min_sizes = [[16, 32], [64, 128], [256, 512]]
    steps = [8, 16, 32]
    priors = []
    for k, step in enumerate(steps):
        fm = int(np.ceil(image_size / step))
        for i in range(fm):
            for j in range(fm):
                for min_size in min_sizes[k]:
                    s_kx = min_size / image_size
                    s_ky = min_size / image_size
                    cx = (j + 0.5) * step / image_size
                    cy = (i + 0.5) * step / image_size
                    priors.append([cx, cy, s_kx, s_ky])
    return np.array(priors, dtype=np.float32)


def _retinaface_detect(img_rgb: Image.Image, model_path: str, input_size: int, conf_threshold: float) -> list[FaceBox]:
    sess = _load_retina_session(model_path, input_size)
    if sess is None:
        return []

    rgb = img_rgb.convert("RGB")
    orig_w, orig_h = rgb.size
    img = np.array(rgb)
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    resized = cv2.resize(bgr, (input_size, input_size))

    blob = cv2.dnn.blobFromImage(resized, scalefactor=1.0, size=(input_size, input_size), mean=(104, 117, 123))
    input_name = sess.get_inputs()[0].name
    started = time.monotonic()
    with throttle.gpu_concurrency_gate():
        outputs = sess.run(None, {input_name: blob})
    throttle.gpu_pace(started)
    if len(outputs) < 2:
        return []

    # Common output ordering: loc, conf, landms
    loc = outputs[0]
    conf = outputs[1]

    if loc is None or conf is None:
        return []

    loc = loc.reshape(-1, 4)
    conf = conf.reshape(-1, 2)

    priors = _generate_priors(input_size)
    if priors.shape[0] != loc.shape[0]:
        # Mismatch; model is likely not compatible with these priors.
        logger.warning("RetinaFace priors mismatch: priors=%s loc=%s", priors.shape, loc.shape)
        return []

    variances = [0.1, 0.2]
    boxes = np.concatenate(
        [
            priors[:, :2] + loc[:, :2] * variances[0] * priors[:, 2:],
            priors[:, 2:] * np.exp(loc[:, 2:] * variances[1]),
        ],
        axis=1,
    )

    # Convert to corner format and scale to input size
    boxes[:, :2] -= boxes[:, 2:] / 2
    boxes[:, 2:] += boxes[:, :2]
    scores = conf[:, 1]

    boxes = boxes[scores >= conf_threshold]
    scores = scores[scores >= conf_threshold]
    if boxes.size == 0:
        return []

    boxes[:, [0, 2]] *= input_size
    boxes[:, [1, 3]] *= input_size

    # Scale back to original size
    scale_x = orig_w / float(input_size)
    scale_y = orig_h / float(input_size)

    out: list[FaceBox] = []
    for b, s in zip(boxes, scores):
        x0, y0, x1, y1 = b
        out.append(
            FaceBox(
                x=float(x0) * scale_x,
                y=float(y0) * scale_y,
                w=max(1.0, float(x1 - x0) * scale_x),
                h=max(1.0, float(y1 - y0) * scale_y),
                score=float(s),
            )
        )
    return _nms(out)


def _retinaface_pip_detect(img_rgb: Image.Image, conf_threshold: float) -> list[FaceBox]:
    global _RETINA_PIP_LOGGED
    try:
        from retinaface import RetinaFace  # type: ignore
    except Exception:
        return []

    if not _RETINA_PIP_LOGGED:
        logger.info("RetinaFace pip backend enabled")
        _RETINA_PIP_LOGGED = True

    try:
        rgb = img_rgb.convert("RGB")
    except Exception:
        return []

    with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        try:
            rgb.save(tmp.name, format="PNG")
            resp = RetinaFace.detect_faces(tmp.name) or {}
        except Exception:
            return []

    out: list[FaceBox] = []
    for _, face in resp.items():
        area = face.get("facial_area") if isinstance(face, dict) else None
        score = face.get("score") if isinstance(face, dict) else None
        if not area or len(area) < 4:
            continue
        if score is not None and float(score) < conf_threshold:
            continue
        x0, y0, x1, y1 = [float(v) for v in area[:4]]
        out.append(FaceBox(x=x0, y=y0, w=max(1.0, x1 - x0), h=max(1.0, y1 - y0), score=float(score or 0.0)))
    return _nms(out)


def _yunet_detect_with_status(
    img_rgb: Image.Image,
    model_path: str,
    input_size: int,
    score_threshold: float,
) -> tuple[list[FaceBox], bool]:
    detector = _load_yunet(model_path, input_size, score_threshold)
    if detector is None:
        return [], False

    rgb = img_rgb.convert("RGB")
    img = np.array(rgb)
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    detector.setInputSize((bgr.shape[1], bgr.shape[0]))
    started = time.monotonic()
    with throttle.gpu_concurrency_gate():
        ok, detections = detector.detect(bgr)
    throttle.gpu_pace(started)
    if not ok or detections is None:
        return [], True

    out: list[FaceBox] = []
    for det in detections:
        x, y, w, h, score = det[:5]
        out.append(FaceBox(float(x), float(y), float(w), float(h), float(score)))
    return out, True


def _haar_detect(img_rgb: Image.Image) -> list[FaceBox]:
    try:
        rgb = img_rgb.convert("RGB")
    except Exception:
        return []
    arr = np.array(rgb)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    try:
        gray = cv2.equalizeHist(gray)
    except Exception:
        pass

    cascade_paths = []
    try:
        base = getattr(cv2, "data", None)
        if base is not None and getattr(base, "haarcascades", None):
            cascade_paths = [
                str(base.haarcascades) + "haarcascade_frontalface_alt2.xml",
                str(base.haarcascades) + "haarcascade_frontalface_default.xml",
            ]
    except Exception:
        cascade_paths = []

    faces = []
    for path in cascade_paths:
        try:
            clf = cv2.CascadeClassifier(path)
            if clf.empty():
                continue
            found = clf.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            if found is not None and len(found) > 0:
                faces = found
                break
        except Exception:
            continue

    out: list[FaceBox] = []
    for (x, y, w, h) in faces:
        out.append(FaceBox(float(x), float(y), float(w), float(h), score=0.35))
    return out


def _pick_editor_box(boxes: list[FaceBox], image_w: int, image_h: int) -> Optional[FaceBox]:
    if not boxes:
        return None

    total_area = float(max(1, image_w * image_h))
    center_x = image_w / 2.0
    center_y = image_h / 2.0

    top_score = max(float(b.score) for b in boxes)
    min_score = max(0.5, top_score - 0.1)

    candidates: list[FaceBox] = []
    for box in boxes:
        area_ratio = (box.w * box.h) / total_area
        if area_ratio < 0.003 or area_ratio > 0.55:
            continue
        if float(box.score) < min_score:
            continue
        candidates.append(box)

    if not candidates:
        candidates = boxes

    def _rank(box: FaceBox) -> tuple[float, float, float]:
        bx = box.x + box.w / 2.0
        by = box.y + box.h / 2.0
        distance = (bx - center_x) ** 2 + (by - center_y) ** 2
        return (-float(box.score), distance, -(box.w * box.h))

    return min(candidates, key=_rank)


def _rotate_for_detection(img_rgb: Image.Image, rotation_cw: int) -> Image.Image:
    rot = int(rotation_cw) % 360
    if rot == 0:
        return img_rgb
    if rot == 90:
        return img_rgb.transpose(Image.ROTATE_270)
    if rot == 180:
        return img_rgb.transpose(Image.ROTATE_180)
    if rot == 270:
        return img_rgb.transpose(Image.ROTATE_90)
    return img_rgb


def _map_box_to_original(box: FaceBox, rotation_cw: int, orig_w: int, orig_h: int) -> FaceBox:
    rot = int(rotation_cw) % 360

    def inv(px: float, py: float) -> tuple[float, float]:
        if rot == 0:
            return px, py
        if rot == 90:
            return py, float(orig_h) - px
        if rot == 180:
            return float(orig_w) - px, float(orig_h) - py
        if rot == 270:
            return float(orig_w) - py, px
        return px, py

    corners = [
        inv(box.x, box.y),
        inv(box.x + box.w, box.y),
        inv(box.x, box.y + box.h),
        inv(box.x + box.w, box.y + box.h),
    ]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]

    x0 = max(0.0, min(float(orig_w), min(xs)))
    y0 = max(0.0, min(float(orig_h), min(ys)))
    x1 = max(0.0, min(float(orig_w), max(xs)))
    y1 = max(0.0, min(float(orig_h), max(ys)))

    return FaceBox(
        x=x0,
        y=y0,
        w=max(1.0, x1 - x0),
        h=max(1.0, y1 - y0),
        score=float(box.score),
    )


def _detect_editor_box_single_orientation_with_meta(img_rgb: Image.Image, settings) -> Optional[tuple[FaceBox, str]]:
    image_w, image_h = img_rgb.size
    yunet_available = False

    if settings.yunet_model_path:
        boxes, yunet_available = _yunet_detect_with_status(
            img_rgb,
            settings.yunet_model_path,
            int(settings.yunet_input_size or 320),
            float(settings.yunet_score_threshold or 0.7),
        )

        # Relaxed second YuNet pass: slightly larger input and lower threshold.
        # This recovers many baby/soft-focus cases that miss at strict defaults.
        if not boxes and yunet_available:
            relaxed_input = max(int(settings.yunet_input_size or 320), 512)
            relaxed_score = max(0.35, min(float(settings.yunet_score_threshold or 0.7), 0.55))
            boxes, _ = _yunet_detect_with_status(
                img_rgb,
                settings.yunet_model_path,
                relaxed_input,
                relaxed_score,
            )

        best = _pick_editor_box(boxes, image_w, image_h)
        if best is not None:
            return best, "yunet"

    if settings.retinaface_model_path:
        boxes = _retinaface_detect(
            img_rgb,
            settings.retinaface_model_path,
            int(settings.retinaface_input_size or 640),
            float(settings.retinaface_confidence or 0.7),
        )
        best = _pick_editor_box(boxes, image_w, image_h)
        if best is not None:
            return best, "retinaface"
    else:
        boxes = _retinaface_pip_detect(img_rgb, float(settings.retinaface_confidence or 0.7))
        best = _pick_editor_box(boxes, image_w, image_h)
        if best is not None:
            return best, "retinaface"

    # If YuNet is available but missed, avoid dropping to Haar (too noisy).
    if yunet_available:
        return None

    boxes = _haar_detect(img_rgb)
    best = _pick_editor_box(boxes, image_w, image_h)
    if best is not None:
        return best, "haar"
    return None


def _detect_editor_box_single_orientation(img_rgb: Image.Image, settings) -> Optional[FaceBox]:
    result = _detect_editor_box_single_orientation_with_meta(img_rgb, settings)
    return result[0] if result else None


def detect_face_box_for_editor_with_meta(img_rgb: Image.Image) -> Optional[tuple[FaceBox, str, int]]:
    settings = get_face_detection_settings()
    image_w, image_h = img_rgb.size

    best_upright = _detect_editor_box_single_orientation_with_meta(img_rgb, settings)
    if best_upright is not None:
        box, detector = best_upright
        return box, detector, 0

    candidates: list[tuple[FaceBox, str, int]] = []

    def _try_rotation(rotation_cw: int) -> tuple[FaceBox, str, int] | None:
        rotated = _rotate_for_detection(img_rgb, rotation_cw)
        best_rot = _detect_editor_box_single_orientation_with_meta(rotated, settings)
        if best_rot is None:
            return None
        rot_box, detector = best_rot
        mapped = _map_box_to_original(rot_box, rotation_cw, image_w, image_h)
        rotation_penalty = 0.02
        return (
            FaceBox(
                x=mapped.x,
                y=mapped.y,
                w=mapped.w,
                h=mapped.h,
                score=max(0.0, float(mapped.score) - rotation_penalty),
            ),
            detector,
            rotation_cw,
        )

    # Run rotations concurrently, but collect results in a deterministic order
    # (90, 270, 180) so ties between equally-scored candidates resolve the same
    # way every run — matching the original sequential behaviour.
    rotations = (90, 270, 180)
    with ThreadPoolExecutor(max_workers=len(rotations)) as pool:
        results = list(pool.map(_try_rotation, rotations))
    for result in results:
        if result is not None:
            candidates.append(result)

    if not candidates:
        return None
    best_box = _pick_editor_box([c[0] for c in candidates], image_w, image_h)
    if best_box is None:
        return None
    for box, detector, rotation_cw in candidates:
        same = (
            abs(box.x - best_box.x) < 1e-3
            and abs(box.y - best_box.y) < 1e-3
            and abs(box.w - best_box.w) < 1e-3
            and abs(box.h - best_box.h) < 1e-3
        )
        if same:
            return box, detector, rotation_cw
    first_box, first_detector, first_rotation = candidates[0]
    return first_box, first_detector, first_rotation


def detect_face(img_rgb: Image.Image) -> Optional[FaceDetection]:
    """Shared detection-and-selection used by both the editor and render.

    Runs the full pipeline (YuNet, relaxed YuNet, RetinaFace, Haar fallback,
    with a rotation search) and applies the single centre-weighted selection
    rule, so "centre on face" picks the same face everywhere. Later
    face-aware features (e.g. face-aware cover crops) should call this and
    use `box`/`center` rather than re-implementing detection.
    """
    result = detect_face_box_for_editor_with_meta(img_rgb)
    if result is None:
        return None
    box, detector, rotation_cw = result
    return FaceDetection(
        box=box,
        center=(box.x + box.w / 2.0, box.y + box.h / 2.0),
        detector=detector,
        rotation_cw=rotation_cw,
    )


def detect_face_box_for_editor(img_rgb: Image.Image) -> Optional[FaceBox]:
    """Editor flow: return the box of the selected face (if any)."""
    result = detect_face_box_for_editor_with_meta(img_rgb)
    return result[0] if result else None


def detect_face_center_for_editor(img_rgb: Image.Image) -> Optional[tuple[float, float]]:
    """Editor flow: prioritize RetinaFace for manual baby photo edits."""
    box = detect_face_box_for_editor(img_rgb)
    if box is None:
        return None
    return (box.x + box.w / 2.0, box.y + box.h / 2.0)


def detect_face_center_for_generation(img_rgb: Image.Image) -> Optional[tuple[float, float]]:
    """Generation flow: centre of the face picked by the shared detect_face().

    Uses the exact same detection and selection as the editor (P3-06), so a
    photo with several faces is centred on the same face in both places.
    """
    detection = detect_face(img_rgb)
    return detection.center if detection is not None else None


def detect_face_box_for_generation(img_rgb: Image.Image) -> Optional[FaceBox]:
    """Generation flow: box of the face picked by the shared detect_face()."""
    detection = detect_face(img_rgb)
    return detection.box if detection is not None else None


def detect_face_center(img_rgb: Image.Image) -> Optional[tuple[float, float]]:
    """Backward-compatible default (editor behavior)."""
    return detect_face_center_for_editor(img_rgb)
