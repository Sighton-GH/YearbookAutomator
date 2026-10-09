import test from "node:test";
import assert from "node:assert/strict";
import { applyReplayFallbacks, replayFailureWarnings } from "../src/utils/replayFallback.ts";

const session = {
  defaultBabyFilename: "def_edit.png",
  people: [
    { index: 0, first_name: "Ana", last_name: "Silva", baby_photo_filename: "ana_edit.png" },
    { index: 1, first_name: "Bo", last_name: "Lee", baby_photo_filename: "bo.png" },
  ],
};
const failures = [
  { op: { input_filename: "ana.png", output_filename: "ana_edit.png", person_index: 0 } },
  { op: { input_filename: "def.png", output_filename: "def_edit.png" } },
];

test("warns per student and for the default photo", () => {
  const w = replayFailureWarnings(failures, session);
  assert.equal(w.length, 2);
  assert.match(w[0], /Ana Silva/);
  assert.match(w[1], /default baby photo/);
});

test("falls back to unedited inputs without touching other people", () => {
  const out = applyReplayFallbacks(session, failures);
  assert.equal(out.people[0].baby_photo_filename, "ana.png");
  assert.equal(out.people[1].baby_photo_filename, "bo.png");
  assert.equal(out.defaultBabyFilename, "def.png");
  assert.equal(session.people[0].baby_photo_filename, "ana_edit.png"); // input not mutated
});

test("chained failures resolve to the earliest input; no failures is identity", () => {
  const chain = [
    { op: { input_filename: "a.png", output_filename: "b.png" } },
    { op: { input_filename: "b.png", output_filename: "c.png" } },
  ];
  const s = { people: [{ first_name: "X", last_name: "Y", baby_photo_filename: "c.png" }] };
  assert.equal(applyReplayFallbacks(s, chain).people[0].baby_photo_filename, "a.png");
  assert.equal(applyReplayFallbacks(s, []), s);
});
