import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/printSize.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { printSizeDescription } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("original spread prints at the specified inches and DPI", () => {
  assert.equal(printSizeDescription({ width: 5475, height: 3675 }, null), "Prints at 18.25 × 12.25 in at 300 dpi");
});

test("custom resolution respects renderer width anchoring and no upscaling", () => {
  const template = { width: 600, height: 400 };
  assert.equal(printSizeDescription(template, { width: 300, height: 999 }), "Prints at 1.00 × 0.67 in at 300 dpi");
  assert.equal(printSizeDescription(template, { width: 900, height: 999 }), "Prints at 2.00 × 1.33 in at 300 dpi");
});
