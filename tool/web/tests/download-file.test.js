import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/downloadFile.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { downloadBlobFile } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("404 JSON blob produces readable text and never starts a download", async () => {
  await assert.rejects(downloadBlobFile("/missing", "output.png", async () => {
    throw { response: { data: new Blob([JSON.stringify({ detail: "This rendered file is no longer available." })]) } };
  }), { message: "This rendered file is no longer available." });
});

test("HTML and network failures produce readable fallback", async () => {
  for (const error of [{ response: { data: new Blob(["<html>error</html>"]) } }, new Error("network")]) {
    await assert.rejects(downloadBlobFile("/missing", "output.png", async () => { throw error; }),
      { message: "Could not download this file. Check your connection and try again." });
  }
});

test("successful response downloads a blob under the intended filename and releases URL", async () => {
  const events = [];
  const originalDocument = globalThis.document;
  const originalTimeout = globalThis.setTimeout;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const anchor = { click: () => events.push("click"), remove: () => events.push("remove") };
  globalThis.document = { createElement: () => anchor, body: { appendChild: () => events.push("append") } };
  URL.createObjectURL = () => "blob:synthetic";
  URL.revokeObjectURL = (url) => events.push(url);
  globalThis.setTimeout = (callback) => callback();
  try {
    await downloadBlobFile("/output", "output.png", async () => new Blob(["synthetic image"]));
    assert.equal(anchor.download, "output.png");
    assert.equal(anchor.href, "blob:synthetic");
    assert.deepEqual(events, ["append", "click", "remove", "blob:synthetic"]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalTimeout;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
