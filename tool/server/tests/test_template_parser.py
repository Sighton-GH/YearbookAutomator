import io

import cv2
import numpy as np
import pytest

from app.services.template_parser import extract_slots


def _png_bytes_from_image(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_extract_slots_basic_detection():
    img = np.ones((420, 640, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (40, 40), (200, 200), (0, 255, 0), -1)  # green mugshot
    cv2.rectangle(img, (240, 40), (400, 200), (255, 0, 0), -1)  # blue baby

    # Required annotated text regions (defaults used by the parser)
    # name:  ff751f -> RGB(255,117,31) -> BGR(31,117,255)
    # quote: ff3131 -> RGB(255,49,49)  -> BGR(49,49,255)
    cv2.rectangle(img, (40, 225), (400, 265), (31, 117, 255), -1)  # orange name box
    cv2.rectangle(img, (40, 275), (560, 315), (49, 49, 255), -1)  # red quote box

    resp = extract_slots(io.BytesIO(_png_bytes_from_image(img)))

    assert resp.slots, "Expected at least one slot from annotated template"
    slot = resp.slots[0]
    assert slot.mugshot.width > 0 and slot.mugshot.height > 0
    assert slot.baby_photo.width > 0 and slot.baby_photo.height > 0
    assert slot.name.y > slot.mugshot.y
    assert slot.quote.y >= slot.name.y


def test_extract_slots_requires_colored_boxes():
    blank = np.ones((200, 200, 3), dtype=np.uint8) * 255
    with pytest.raises(ValueError):
        extract_slots(io.BytesIO(_png_bytes_from_image(blank)))
