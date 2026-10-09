import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Use the existing Vite compiler dependency, with no new test/runtime dependency.
test("People inspector offers retry only for a retained failed baby photo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "baby-retry-"));
  try {
    const output = path.join(dir, "inspector.cjs");
    await build({
      stdin: {
        contents: `import React from 'react';
          import { renderToStaticMarkup } from 'react-dom/server';
          import { PersonInspector } from './src/components/PersonInspector';
          export const render = (person, locked = false, skip = false) => renderToStaticMarkup(
            React.createElement(PersonInspector, {
              person, isLocked: locked, skipBabyPhotos: skip, skipQuotes: true,
              workspaceId: null, babyFilename: person.baby_photo_filename,
              babyAspect: 1, assignedDefaultQuote: '', defaultQuoteFallback: '',
              loading: false, onOpenBabyEditor: () => {},
            }));`,
        resolveDir: process.cwd(), loader: "tsx",
      },
      bundle: true, platform: "node", format: "cjs", outfile: output,
      jsx: "automatic", define: { "import.meta.env": "{}" },
    });
    const { render } = await import(pathToFileURL(output).href);
    const person = { index: 1, first_name: "Ana", last_name: "Silva", baby_photo_filename: "Ana.png", baby_background_removal_failed: true };
    assert.match(render(person), /Retry background removal/);
    assert.match(render(person), /Original photo kept/);
    assert.match(render(person, true), /disabled=""[^>]*>.*?Retry background removal/s);
    assert.doesNotMatch(render({ ...person, baby_background_removal_failed: false }), /Retry background removal/);
    assert.doesNotMatch(render({ ...person, baby_photo_filename: null }), /Retry background removal/);
    assert.doesNotMatch(render(person, false, true), /Retry background removal/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
