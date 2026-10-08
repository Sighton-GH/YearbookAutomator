import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useLayoutHistory } from "./useLayoutHistory";
import { LayoutTab } from "../../steps/edit/LayoutTab";
import { TemplatePreview } from "../../components/TemplatePreview";
import { SlotInspectorFields } from "../../components/SlotInspectorFields";
import { computeSlotNumberToIndex } from "../placement";
import type { TemplateSlots } from "../../api";
import type { PlacementMode } from "../../types";

const slot = (x: number, y: number): TemplateSlots => ({
  mugshot: { x, y, width: 60, height: 60 }, baby_photo: { x, y, width: 10, height: 10 },
  name: { x, y: y + 65, width: 60, height: 20 }, quote: { x, y: y + 90, width: 60, height: 20 },
});
const initial = [slot(700, 30), slot(40, 220), slot(40, 30), slot(700, 220)];
const fixtures: unknown[] = [];
for (const mode of ["simultaneous", "left_then_right"] as PlacementMode[]) {
  test(`LayoutTab preserves physical pins through edits and undo/redo (${mode})`, () => {
    let state!: ReturnType<typeof useLayoutHistory>;
    function Harness() {
      state = useLayoutHistory(mode);
      const [selected, select] = useState<number | null>(null);
      return <LayoutTab slots={state.slots} templateSize={{ width: 1000, height: 600 }}
        placementMode={mode} onSlots={state.setSlots} selectedSlot={selected} onSelectedSlot={select}
        previewMode="clean" onPreviewMode={() => {}} annotatedPreviewUrl={null} cleanPreviewUrl={null}
        templatePreviewUrl={null} parsedSlots={[]} rawDebug={null} peoplePerSpread={3} layoutHistory={state.layoutHistory} />;
    }
    let view!: ReactTestRenderer;
    act(() => { view = create(<Harness />); });
    const click = (label: string) => act(() => {
      const button = view.root.findAllByType("button").filter(b => b.children.join("") === label).at(-1);
      assert.ok(button, label); assert.ok(!button.props.disabled, label); button.props.onClick();
    });
    const select = (index: number) => act(() => view.root.findByType("select").props.onChange({ target: { value: String(index) } }));
    const setup = () => act(() => {
      state.resetSlots(initial);
      const order = computeSlotNumberToIndex(initial, mode, null);
      state.setSlotAssignments({ 1: order.indexOf(2) + 1, 2: order.indexOf(0) + 1 });
    });
    const capture = (name: string, expected: Array<TemplateSlots | null>) => {
      const order = computeSlotNumberToIndex(state.slots, mode, null);
      expected.forEach((physical, index) => {
        const number = state.slotAssignments[index + 1];
        if (physical === null) assert.equal(number, undefined);
        else assert.deepEqual(state.slots[order[number - 1]], physical);
      });
      fixtures.push({ name: `${mode}-${name}`, mode, slots: state.slots, assignments: state.slotAssignments });
    };
    const roundtrip = (name: string, expected: Array<TemplateSlots | null>) => {
      capture(name, expected); click("Undo layout"); capture(`${name}-undo`, [initial[2], initial[0]]);
      click("Redo layout"); capture(`${name}-redo`, expected);
    };
    setup(); select(1); click("Delete slot"); click("Delete slot"); roundtrip("delete-before", [initial[2], initial[0]]);
    setup(); select(0); click("Delete slot"); click("Delete slot"); roundtrip("delete-pinned", [initial[2], null]);
    setup(); click("Add slot"); roundtrip("add", [initial[2], initial[0]]);
    setup(); select(0); click("Duplicate slot"); roundtrip("duplicate", [initial[2], initial[0]]);
    setup(); click("Renumber slots");
    act(() => view.root.findByType(TemplatePreview).props.onSelectSlot(2));
    act(() => view.root.findByType(TemplatePreview).props.onSelectSlot(0));
    click("Apply order"); roundtrip("renumber", [initial[2], initial[0]]);
    setup(); click("Regroup nearby slots"); click("Continue"); roundtrip("regroup-truncate", [initial[2], initial[0]]);
    setup();
    act(() => {
      const order = computeSlotNumberToIndex(initial, mode, null);
      state.setSlotAssignments({ 1: order.indexOf(2) + 1, 2: order.indexOf(3) + 1 });
    });
    click("Regroup nearby slots"); click("Continue"); capture("regroup-deleted-pin", [initial[2], null]);
    click("Undo layout"); capture("regroup-deleted-pin-undo", [initial[2], initial[3]]);
    click("Redo layout"); capture("regroup-deleted-pin-redo", [initial[2], null]);
    setup(); select(2);
    const moved = slot(850, 410);
    act(() => view.root.findByType(SlotInspectorFields).props.onChange(moved));
    roundtrip("move-across-pages", [moved, initial[0]]);
    act(() => state.setSlotAssignments({ 1: 1 }));
    assert.equal(state.layoutHistory.canUndo, false, "later manual pins reset stale layout history");
    act(() => view.unmount());
  });
}
test("render/spreadsheet fixtures match the actual LayoutTab callbacks", () => {
  const path = "../server/tests/fixtures/layout_assignments.json";
  if (process.env.UPDATE_LAYOUT_FIXTURES) writeFileSync(path, "[\n" + fixtures.map(f => JSON.stringify(f)).join(",\n") + "\n]\n");
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), fixtures);
});
