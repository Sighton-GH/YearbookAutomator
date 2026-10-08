import test from "node:test";
import assert from "node:assert/strict";
import { editPersonName, hasNameEdit, keepNameEdits } from "../src/utils/personEdits.ts";
const p = {index: 1, first_name: "Alex", last_name: "Example"};
test("name edits retain the original after successive edits and JSON round-trip", () => {
  const edited = JSON.parse(JSON.stringify(editPersonName(editPersonName(p, "first_name", "Alix"), "last_name", "Sample")));
  assert.equal(edited.original_first_name, "Alex");
  assert.equal(hasNameEdit(edited), true);
  assert.equal(keepNameEdits([p], [edited])[0].first_name, "Alix");
  assert.equal(hasNameEdit(editPersonName(editPersonName(p, "first_name", "Alix"), "first_name", "Alex")), false);
});
test("changed roster identities never inherit another student's edits", () => {
  const fresh = {...p, first_name: "Jordan"};
  assert.deepEqual(keepNameEdits([fresh], [editPersonName(p, "first_name", "Alix")]), [fresh]);
});
