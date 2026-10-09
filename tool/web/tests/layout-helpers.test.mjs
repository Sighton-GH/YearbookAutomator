import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

for (const name of ["slotOps", "slotNumbering", "viewport", "history", "assignmentIntegration"]) {
  test(`layout ${name} helper regressions`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layout-test-"));
    try {
      const output = path.join(dir, `${name}.cjs`);
      await build({ entryPoints: [`src/utils/layout/${name}.test.${name === "assignmentIntegration" ? "tsx" : "ts"}`], bundle: true, platform: "node", format: "cjs", outfile: output });
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      execFileSync(process.execPath, ["--test", output], { stdio: "pipe", env });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
