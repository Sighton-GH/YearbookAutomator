import io

import cv2
import numpy as np
import pytest

from app.services import storage
from app.services.template_parser import extract_slots, tolerance_steps


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'BASE_DATA', tmp_path)


def synthetic_template():
    img = np.full((500, 600, 3), 255, np.uint8)
    # Exact default colours, two portraits but only one name and quote.
    for x in (20, 300):
        cv2.rectangle(img, (x, 20), (x + 80, 120), (0, 191, 0), -1)
        cv2.rectangle(img, (x, 140), (x + 80, 210), (173, 74, 0), -1)
    cv2.rectangle(img, (20, 250), (100, 280), (31, 117, 255), -1)
    cv2.rectangle(img, (20, 320), (100, 370), (49, 49, 255), -1)
    return cv2.imencode('.png', img)[1].tobytes()


def test_omitted_tolerance_keeps_legacy_sweep():
    assert tolerance_steps(None, [20, 24, 32, 40, 48]) == [20, 24, 32, 40, 48]
    assert tolerance_steps(0, []) == [0, 8, 16, 24, 32]
    assert tolerance_steps(64, []) == [64]
    for value in (-1, 65):
        with pytest.raises(ValueError):
            tolerance_steps(value, [])


def test_reports_guessed_boxes_in_clean_coordinates():
    annotated = synthetic_template()
    clean = cv2.imencode('.png', np.full((1000, 1200, 3), 255, np.uint8))[1].tobytes()
    result = extract_slots(io.BytesIO(annotated), clean_template=io.BytesIO(clean), tolerance=0)
    assert len(result.slots) == 2
    debug = result.raw_debug
    assert debug.name_count == 1
    assert len(debug.invented['name']) == 1
    assert debug.invented['name'][0] == result.slots[1].name
    assert debug.invented['quote'][0] == result.slots[1].quote
    assert '1 quote box was guessed - please check them' in debug.messages


def test_reports_extra_dropped_boxes():
    img = cv2.imdecode(np.frombuffer(synthetic_template(), np.uint8), cv2.IMREAD_COLOR)
    for x in (300, 450):
        cv2.rectangle(img, (x, 250), (x + 80, 280), (31, 117, 255), -1)
    result = extract_slots(io.BytesIO(cv2.imencode('.png', img)[1].tobytes()), tolerance=0)
    assert result.raw_debug.name_count == 3
    assert len(result.raw_debug.dropped['name']) == 1
    assert '1 extra name box was ignored' in result.raw_debug.messages


def test_explicit_sensitivity_changes_detection():
    img = cv2.imdecode(np.frombuffer(synthetic_template(), np.uint8), cv2.IMREAD_COLOR)
    # Grey blue needs a larger saturation sweep than the legacy maximum.
    img[140:211, 20:101] = (173, 150, 120)
    img[140:211, 300:381] = (173, 150, 120)
    low = extract_slots(io.BytesIO(cv2.imencode('.png', img)[1].tobytes()), tolerance=0)
    high = extract_slots(io.BytesIO(cv2.imencode('.png', img)[1].tobytes()), tolerance=64)
    assert low.raw_debug.baby_count == 0
    assert high.raw_debug.baby_count > 0
