import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

for (const name of ["slotOps", "slotNumbering", "viewport", "history"]) {
  test(`layout ${name} helper regressions`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layout-test-"));
    try {
      const output = path.join(dir, `${name}.cjs`);
      await build({ entryPoints: [`src/utils/layout/${name}.test.ts`], bundle: true, platform: "node", format: "cjs", outfile: output });
      execFileSync(process.execPath, ["--test", output], { stdio: "pipe" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
