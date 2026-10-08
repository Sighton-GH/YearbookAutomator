import test from "node:test";
import assert from "node:assert/strict";
import { comparePeopleByLastName, foldName } from "../src/utils/placement.ts";

const p = (index, first_name, last_name) => ({ index, first_name, last_name });

test("accented names sort with their unaccented neighbours", () => {
  const people = [p(1, "Éva", "Dupont"), p(2, "Erin", "Duran"), p(3, "Émile", "Durand")];
  const sorted = [...people].sort(comparePeopleByLastName).map((x) => `${x.first_name} ${x.last_name}`);
  // Same expected order as the backend test in test_name_sort_order.py.
  assert.deepEqual(sorted, ["Éva Dupont", "Erin Duran", "Émile Durand"]);
});

test("accent on the first letter of the last name does not move it", () => {
  const people = [p(1, "A", "Zed"), p(2, "B", "Élan"), p(3, "C", "Eagle")];
  const sorted = [...people].sort(comparePeopleByLastName).map((x) => x.last_name);
  assert.deepEqual(sorted, ["Eagle", "Élan", "Zed"]);
});

test("case-insensitive, first name breaks ties, blank last names last, then index", () => {
  const people = [p(5, "x", ""), p(4, "bob", "SMITH"), p(3, "Amy", "smith"), p(2, "Amy", "Smith"), p(1, "Zed", "Abe")];
  const sorted = [...people].sort(comparePeopleByLastName).map((x) => x.index);
  assert.deepEqual(sorted, [1, 2, 3, 4, 5]);
});

test("foldName strips combining marks and case", () => {
  assert.equal(foldName("  Émile "), "emile");
  assert.equal(foldName(null), "");
});

test("Unicode casefold matches Python for German and Greek names", () => {
  assert.equal(foldName("Straße"), "strasse");
  assert.equal(foldName("ς"), "σ");
});
