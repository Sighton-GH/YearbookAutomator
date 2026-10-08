"""Cross-language acceptance: actual LayoutTab transaction snapshots -> pixels -> XLSX."""
from __future__ import annotations

import io
import json
from pathlib import Path
import shutil

from PIL import Image
import pandas as pd
import pytest
from fastapi import FastAPI

from app.models.schemas import GenerationRequest
from app.routes import generation
from app.services import generator, storage
from live_test_client import LiveTestClient

FIXTURES = json.loads((Path(__file__).parent / "fixtures/layout_assignments.json").read_text())
COLORS = {1: (255, 0, 0), 2: (0, 255, 0), 3: (0, 0, 255)}


def expected_numbers(people, count, assignments):
    """Independent two-pass oracle (not the production placement helper)."""
    result, claimed = {}, set()
    for person in people:
        n = assignments.get(person, assignments.get(str(person)))
        if isinstance(n, int) and 1 <= n <= count and n not in claimed:
            result[person] = n
            claimed.add(n)
    for i, person in enumerate(people, 1):
        if person not in result:
            n = i if i <= count and i not in claimed else next(n for n in range(1, count + 1) if n not in claimed)
            result[person] = n
            claimed.add(n)
    return result


@pytest.mark.parametrize("auto_place", [False, True])
def test_assigned_pixels_and_spreadsheet_after_every_layout_transaction(tmp_path, monkeypatch, auto_place):
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path)
    # Exercise the real export endpoint; isolate unrelated auth plumbing.
    monkeypatch.setattr(generation, "enforce_workspace_read", lambda *args: None)
    app = FastAPI()
    app.include_router(generation.router, prefix="/generation")
    root = storage.workspace_dir("layout-acceptance")
    Image.new("RGB", (1000, 600), "white").save(root / "template_clean.png")
    (root / "mugshots").mkdir(exist_ok=True)
    req_dir = root / "generation/requests"
    req_dir.mkdir(parents=True)
    for person, color in COLORS.items():
        Image.new("RGB", (60, 60), color).save(root / "mugshots" / f"{person}.png")

    cases = list(FIXTURES) + [
        {"name": "out-of-range-and-collision", "mode": "simultaneous", "slots": FIXTURES[0]["slots"], "assignments": {1: 999, 2: 3, 3: 3}},
        {"name": "negative-and-zero", "mode": "simultaneous", "slots": FIXTURES[0]["slots"], "assignments": {1: 0, 2: -1, 3: 2}},
        {"name": "unassigned-default", "mode": "simultaneous", "slots": FIXTURES[0]["slots"], "assignments": {}},
    ]
    expected_rows = {}
    evidence = None
    for spread, case in enumerate(cases, 1):
        active = list(COLORS) if case["name"] in {"out-of-range-and-collision", "negative-and-zero", "unassigned-default"} else [1, 2]
        payload = GenerationRequest(
            workspace_id="layout-acceptance", template_id="fictional", font_family="DejaVu Sans",
            slots=case["slots"], people=[dict(index=p, first_name="", last_name="", mugshot_filename=f"{p}.png", quote_blank=True) for p in active],
            slot_assignments=case["assignments"], auto_place=auto_place, placement_mode=case["mode"],
        )
        numbers = expected_numbers(active, len(payload.slots), payload.slot_assignments)
        # Fixtures deliberately have two distinct columns, so independent left/right reading order is simple.
        order = list(range(len(payload.slots)))
        if auto_place and case["mode"] == "left_then_right":
            mid = max(s.mugshot.x + s.mugshot.width for s in payload.slots) / 2
            order.sort(key=lambda i: (payload.slots[i].mugshot.x + 30 >= mid,
                                      payload.slots[i].mugshot.y, payload.slots[i].mugshot.x))
        rendered = generator.generate_composite(payload)
        with Image.open(rendered) as image:
            for person, number in numbers.items():
                box = payload.slots[order[number - 1]].mugshot
                assert image.getpixel((box.x + 30, box.y + 30)) == COLORS[person], case["name"]
                expected_rows[(spread, person)] = number
            if evidence is None:
                evidence = image.copy()
        stem = f"output_{spread:02d}"
        shutil.copyfile(rendered, root / f"{stem}.png")
        (req_dir / f"{stem}.json").write_text(payload.model_dump_json())
        # The renderer's preview is not one of our saved spread outputs.
        if rendered.name != f"{stem}.png" and rendered.name.startswith("output"):
            rendered.unlink()
    client = LiveTestClient(app)
    try:
        response = client.get("/generation/download-spreadsheet", params={"workspace_id": "layout-acceptance"})
        assert response.status_code == 200, response.text
        df = pd.read_excel(io.BytesIO(response.content))
        actual = {(int(r["Spread Number"]), int(r["Number"])): int(r["Slot Number"]) for _, r in df.iterrows()}
        assert actual == expected_rows
    finally:
        client.close()
    # Keep a fictional assigned-person render for direct visual inspection when requested.
    import os
    if os.getenv("LAYOUT_RENDER_EVIDENCE"):
        evidence.save(os.environ["LAYOUT_RENDER_EVIDENCE"].replace(".png", f"-{auto_place}.png"))
