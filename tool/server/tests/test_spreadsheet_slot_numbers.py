from __future__ import annotations

import importlib
import io
import json

from app.models.schemas import Box, GenerationRequest, PersonRecord, TemplateSlots
from app.services import licensing
from app.services.placement import auto_place_slots_for_people


def _slot(x: int, y: int) -> TemplateSlots:
    b = Box(x=x, y=y, width=100, height=100)
    return TemplateSlots(mugshot=b, baby_photo=b, name=b, quote=b)


def _slots() -> list[TemplateSlots]:
    # 2x2 per page, two pages; returned in simultaneous (y, then x) order.
    out = []
    for r in range(2):
        for page_x in (0, 1000):
            for c in range(2):
                out.append(_slot(page_x + c * 120, 100 + r * 130))
    out.sort(key=lambda s: (s.mugshot.y, s.mugshot.x))
    return out


def test_spreadsheet_slot_numbers_match_generator_placement(tmp_path, monkeypatch):
    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)
    key = licensing.create_license(license_type="commercial", note="test")

    from app.services.workspace_registry import resolve_workspace

    workspace_id = resolve_workspace(
        license_key=key, license_type="commercial", device_id="dev1", session_id="s-slots"
    ).workspace_id
    root = storage.workspace_dir(workspace_id)
    req_dir = root / "generation" / "requests"
    req_dir.mkdir(parents=True, exist_ok=True)

    slots = _slots()
    spreads = [
        [
            PersonRecord(index=1, first_name="Zed", last_name="Zulu"),
            PersonRecord(index=2, first_name="Amy", last_name="Alpha"),
            PersonRecord(index=3, first_name="Cal", last_name="Charlie"),
            PersonRecord(index=4, first_name="Bob", last_name="Bravo"),
        ],
        [
            PersonRecord(index=5, first_name="Yan", last_name="Yankee"),
            PersonRecord(index=6, first_name="Dee", last_name="Delta"),
            PersonRecord(index=7, first_name="Eve", last_name="Echo"),
        ],
    ]

    expected: dict[int, tuple[int, int]] = {}
    for n, chunk in enumerate(spreads, start=1):
        payload = GenerationRequest(
            workspace_id=workspace_id,
            template_id="t",
            font_family="Arial",
            slots=slots,
            people=chunk,
            auto_place=True,
            placement_mode="left_then_right",
            force_alphabetical=True,
            slot_assignments={},
        )
        stem = f"output_{n:02d}"
        (root / f"{stem}.png").write_bytes(b"x")
        (req_dir / f"{stem}.json").write_text(payload.model_dump_json(), encoding="utf-8")

        # What the renderer does with the same request.
        eff_people, eff_slots = auto_place_slots_for_people(
            people=payload.people,
            slots=payload.slots,
            placement_mode=payload.placement_mode,
            slot_assignments=payload.slot_assignments,
            force_alphabetical=payload.force_alphabetical,
        )
        from app.services.placement import compute_slot_number_to_index

        s2i = compute_slot_number_to_index(slots, "left_then_right")
        for person, slot in zip(eff_people, eff_slots):
            logical = s2i.index(slots.index(slot))
            expected[person.index] = (n, logical + 1)

    resp = client.get(
        "/api/generation/download-spreadsheet",
        params={"workspace_id": workspace_id},
        headers={"X-License-Key": key, "X-Device-Id": "dev1"},
    )
    assert resp.status_code == 200

    import pandas as pd

    df = pd.read_excel(io.BytesIO(resp.content))
    got = {int(r["Number"]): (int(r["Spread Number"]), int(r["Slot Number"])) for _, r in df.iterrows()}
    assert got == expected
    # Alphabetical order drove the numbering: Alpha is slot 1 on spread 1.
    assert got[2] == (1, 1)
    assert got[1] == (1, 4)
    # Rows follow the printed order, not the input order.
    assert list(df["Number"][:4]) == [2, 4, 3, 1]
