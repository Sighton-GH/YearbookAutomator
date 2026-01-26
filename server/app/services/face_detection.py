from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from app.services.admin_settings import get_face_detection_settings


logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True)
class FaceBox:
    x: float
    y: float
    w: float
    h: float
    score: float


_RETINA_SESSION: object | None = None
_RETINA_MODEL_PATH: str | None = None
_RETINA_INPUT_SIZE: int | None = None
_RETINA_PROVIDERS: list[str] | None = None

_YUNET: object | None = None
_YUNET_MODEL_PATH: str | None = None
_YUNET_INPUT_SIZE: int | None = None
_YUNET_SCORE: float | None = None


def _get_ort_providers() -> list[str] | None:
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
        return None
    if not Path(model_path).exists():
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
    except Exception:
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
    outputs = sess.run(None, {input_name: blob})
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


def _yunet_detect(img_rgb: Image.Image, model_path: str, input_size: int, score_threshold: float) -> list[FaceBox]:
    detector = _load_yunet(model_path, input_size, score_threshold)
    if detector is None:
        return []

    rgb = img_rgb.convert("RGB")
    img = np.array(rgb)
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    detector.setInputSize((bgr.shape[1], bgr.shape[0]))
    ok, detections = detector.detect(bgr)
    if not ok or detections is None:
        return []

    out: list[FaceBox] = []
    for det in detections:
        x, y, w, h, score = det[:5]
        out.append(FaceBox(float(x), float(y), float(w), float(h), float(score)))
    return out


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
        out.append(FaceBox(float(x), float(y), float(w), float(h), score=1.0))
    return out


def _pick_center(boxes: list[FaceBox]) -> Optional[tuple[float, float]]:
    if not boxes:
        return None
    # Prefer the largest face (more stable for baby photos)
    best = max(boxes, key=lambda b: b.w * b.h)
    return (best.x + best.w / 2.0, best.y + best.h / 2.0)


def detect_face_center(img_rgb: Image.Image) -> Optional[tuple[float, float]]:
    settings = get_face_detection_settings()

    # 1) RetinaFace (preferred)
    if settings.retinaface_model_path:
        boxes = _retinaface_detect(
            img_rgb,
            settings.retinaface_model_path,
            int(settings.retinaface_input_size or 640),
            float(settings.retinaface_confidence or 0.7),
        )
        center = _pick_center(boxes)
        if center is not None:
            return center

    # 2) YuNet (opt-in)
    if settings.enable_yunet and settings.yunet_model_path:
        boxes = _yunet_detect(
            img_rgb,
            settings.yunet_model_path,
            int(settings.yunet_input_size or 320),
            float(settings.yunet_score_threshold or 0.7),
        )
        center = _pick_center(boxes)
        if center is not None:
            return center

    # 3) Haar fallback
    boxes = _haar_detect(img_rgb)
    return _pick_center(boxes)
