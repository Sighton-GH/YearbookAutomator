import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/utils/rotation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { rotateFocusPoint, rotatedSize } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const size = { width: 400, height: 200 };
const point = { x: 100, y: 50 };
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

for (const [rotation, x, y, width, height] of [
  [0, 100, 50, 400, 200],
  [90, 150, 100, 200, 400],
  [180, 300, 150, 400, 200],
  [270, 50, 300, 200, 400],
]) {
  test(`focus point and non-square bounds at ${rotation} degrees`, () => {
    const focus = rotateFocusPoint(point, size, rotation);
    const bounds = rotatedSize(size, rotation);
    close(focus.x, x);
    close(focus.y, y);
    close(bounds.width, width);
    close(bounds.height, height);
    const centre = rotateFocusPoint({ x: 200, y: 100 }, size, rotation);
    close(centre.x, width / 2);
    close(centre.y, height / 2);
  });
}

test("negative and full-turn rotations use the same coordinate system", () => {
  const expected = rotateFocusPoint(point, size, 270);
  const actual = rotateFocusPoint(point, size, -90);
  close(actual.x, expected.x);
  close(actual.y, expected.y);
  close(rotateFocusPoint(point, size, 360).x, point.x);
});
