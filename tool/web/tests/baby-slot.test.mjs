import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function load() {
  const out = await build({
    entryPoints: ["src/utils/babySlot.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const box = (x, w, h) => ({ x, y: 0, width: w, height: h });
const slots = [
  { baby_photo: box(0, 100, 100) },
  { baby_photo: box(200, 80, 120) },
];
const person = (index) => ({ index });

test("each person resolves to the baby box of their actual slot", async () => {
  const { babyBoxesByPerson } = await load();
  const out = babyBoxesByPerson({
    people: [person(1), person(2), person(3)],
    slots,
    slotNumberToIndex: [0, 1],
    slotAssignments: {},
    peoplePerSpread: 2,
  });
  assert.equal(out[1], slots[0].baby_photo);
  assert.equal(out[2], slots[1].baby_photo);
  assert.equal(out[3], slots[0].baby_photo); // next spread wraps
});

test("explicit slot assignment and placement order are honoured", async () => {
  const { babyBoxesByPerson } = await load();
  const out = babyBoxesByPerson({
    people: [person(1), person(2)],
    slots,
    slotNumberToIndex: [1, 0], // logical slot 1 is physical slot 2
    slotAssignments: { 2: 2 },
    peoplePerSpread: 2,
  });
  assert.equal(out[1], slots[1].baby_photo);
  assert.equal(out[2], slots[0].baby_photo);
});

test("no slots gives an empty map", async () => {
  const { babyBoxesByPerson } = await load();
  assert.deepEqual(babyBoxesByPerson({ people: [person(1)], slots: [], slotNumberToIndex: [], slotAssignments: {}, peoplePerSpread: 16 }), {});
});
