import test from "node:test";
import assert from "node:assert/strict";
import { canRedo, canUndo, createHistory, historyShortcut, pushHistory, redo, resetHistory, undo } from "./history.ts";

test("push / undo / redo", () => {
  let h = createHistory({ n: 0 });
  h = pushHistory(h, { n: 1 });
  h = pushHistory(h, { n: 2 });
  assert.equal(h.present.n, 2);
  h = undo(h);
  assert.equal(h.present.n, 1);
  assert.ok(canRedo(h));
  h = redo(h);
  assert.equal(h.present.n, 2);
  assert.ok(!canRedo(h));
});

test("new push clears redo; empty undo/redo are no-ops", () => {
  let h = createHistory({ n: 0 });
  assert.equal(undo(h), h);
  assert.equal(redo(h), h);
  h = pushHistory(h, { n: 1 });
  h = undo(h);
  h = pushHistory(h, { n: 5 });
  assert.ok(!canRedo(h));
});

test("equal state does not create a step", () => {
  let h = createHistory({ n: 0 });
  const same = pushHistory(h, { n: 0 });
  assert.equal(same, h);
  h = pushHistory(h, { n: 1 });
  assert.ok(canUndo(h));
});

test("keeps at least 50 steps, drops oldest", () => {
  let h = createHistory(0, 5);
  assert.equal(h.limit, 50);
  for (let i = 1; i <= 80; i++) h = pushHistory(h, i);
  assert.equal(h.past.length, 50);
  for (let i = 0; i < 50; i++) h = undo(h);
  assert.equal(h.present, 30);
  assert.ok(!canUndo(h));
});

test("coalescing merges a drag into one step", () => {
  let h = createHistory({ x: 0 });
  for (let i = 1; i <= 10; i++) h = pushHistory(h, { x: i }, "drag-1");
  assert.equal(h.past.length, 1);
  assert.equal(h.present.x, 10);
  h = undo(h);
  assert.equal(h.present.x, 0);
  h = redo(h);
  h = pushHistory(h, { x: 11 }, "drag-2");
  assert.equal(h.past.length, 2);
});

test("reset clears; shortcuts", () => {
  let h = createHistory(1);
  h = pushHistory(h, 2);
  h = resetHistory(h, 9);
  assert.equal(h.present, 9);
  assert.ok(!canUndo(h));
  const e = (key: string, o = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
  assert.equal(historyShortcut(e("z", { ctrlKey: true })), "undo");
  assert.equal(historyShortcut(e("Z", { metaKey: true, shiftKey: true })), "redo");
  assert.equal(historyShortcut(e("y", { ctrlKey: true })), "redo");
  assert.equal(historyShortcut(e("z")), null);
});
