import test from "node:test";
import assert from "node:assert/strict";
import {moveToSpread, resolvePersonSlots} from "../src/utils/personPosition.ts";
const people = [1,2,3,4].map(index => ({index, first_name: "Alex", last_name: "Example"}));
test("explicit positions claim first and collisions match backend fallback", () => {
  assert.deepEqual(resolvePersonSlots(people.slice(0,3), 4, {1:3,2:3}), [3,2,1]);
  assert.deepEqual(resolvePersonSlots(people.slice(0,3), 4, {}), [1,2,3]);
});
test("cross-spread exchange preserves excluded records and same-spread order", () => {
  const withExcluded = [people[0], {...people[1], excluded:true}, ...people.slice(2)];
  assert.deepEqual(moveToSpread(withExcluded, 1, 2, 2).map(p => p.index), [4,2,3,1]);
  assert.deepEqual(moveToSpread(people, 2, 1, 2), people);
});
