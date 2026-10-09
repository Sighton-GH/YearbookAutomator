import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";

async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const { parseStepFromSearch } = await load("../src/session.ts");
const { centredPhoto, faceDetectionMessage } = await load("../src/utils/babyEditor.ts");

test("step query values ignore case, including legacy names", () => {
  for (const [value, expected] of [
    ["IMPORT", "template"], ["Edit", "people"], ["FINALIZE", "generate"],
    ["TEMPLATE", "template"], ["Roster", "roster"], ["PEOPLE", "people"],
    ["Style", "style"], ["GENERATE", "generate"], ["6", "style"],
    ["7", "generate"], ["unknown", null], ["", null],
  ]) assert.equal(parseStepFromSearch(`?step=${value}`), expected);
  assert.equal(parseStepFromSearch("?step=%20IMPORT%20"), "template");
});

test("Centre resets the crop and fit zoom without changing rotation", () => {
  assert.deepEqual(centredPhoto(), { crop: { x: 0, y: 0 }, zoom: 1 });
  const first = centredPhoto();
  first.crop.x = 20;
  assert.equal(centredPhoto().crop.x, 0);
});

test("unavailable face detection uses plain language", () => {
  assert.match(faceDetectionMessage("unavailable"), /manually/);
  assert.doesNotMatch(faceDetectionMessage("unavailable"), /OpenCV|Python|rembg/);
  assert.equal(faceDetectionMessage("not_found"), "No face found");
});

test("face results have no auto-dismiss timer; deliberate actions dismiss them", () => {
  const editor = readFileSync(new URL("../src/components/BabyPhotoEditor.tsx", import.meta.url), "utf8");
  const action = editor.slice(editor.indexOf("const centerEditingOnFace"), editor.indexOf("const applyEdits"));
  assert.doesNotMatch(action, /setCenterFacePopoverOpen\(false\)/);
  assert.match(editor, /onPointerDown=.*setCenterFacePopoverOpen\(false\)/);
  assert.match(editor, /title="Centre the photo and reset zoom to fit"/);
});
