import test from "node:test";
import assert from "node:assert/strict";
import {applyBulkPeople} from "../src/utils/bulkPeople.ts";
const people = [1,2,3].map(index => ({index, first_name:"Alex", last_name:"Sample", quote:"Hello", baby_photo_filename:"baby.png"}));
test("bulk actions honour selection and locks without mutating originals", () => {
  const selected = new Set([1,2]);
  const result = applyBulkPeople(people, selected, {2:true}, "exclude", 40);
  assert.equal(result[0].excluded, true);
  assert.equal(result[1], people[1]); assert.equal(result[2], people[2]);
  assert.equal(people[0].excluded, undefined);
  assert.equal(applyBulkPeople(result, selected, {}, "include", 40)[0].excluded, false);
});
test("clearing quotes and baby photos suppresses defaults; size override persists in JSON", () => {
  const selected = new Set([1]);
  assert.equal(applyBulkPeople(people, selected, {}, "clear-quotes", 40)[0].quote_blank, true);
  assert.equal(applyBulkPeople(people, selected, {}, "clear-baby", 40)[0].hide_baby_photo, true);
  assert.equal(JSON.parse(JSON.stringify(applyBulkPeople(people, selected, {}, "quote-size", 23)))[0].quote_font_size, 23);
});
