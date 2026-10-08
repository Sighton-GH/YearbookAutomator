import test from "node:test";
import assert from "node:assert/strict";
import { nextTrapIndex } from "../src/utils/dialogFocus.ts";

test("Tab on last wraps to first, Shift+Tab on first wraps to last", () => {
  assert.equal(nextTrapIndex(2, 3, false), 0);
  assert.equal(nextTrapIndex(0, 3, true), 2);
});
test("middle positions use native focus movement", () => {
  assert.equal(nextTrapIndex(1, 3, false), null);
  assert.equal(nextTrapIndex(1, 3, true), null);
});
test("focus outside the dialog is pulled in", () => {
  assert.equal(nextTrapIndex(-1, 3, false), 0);
  assert.equal(nextTrapIndex(-1, 3, true), 2);
});
test("no focusable items", () => {
  assert.equal(nextTrapIndex(-1, 0, false), null);
});
test("single item stays put", () => {
  assert.equal(nextTrapIndex(0, 1, false), 0);
  assert.equal(nextTrapIndex(0, 1, true), 0);
});
