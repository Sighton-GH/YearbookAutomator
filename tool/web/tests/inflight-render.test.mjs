import test from "node:test";
import assert from "node:assert/strict";
import {
  INFLIGHT_RENDER_KEY, saveInflightRender, loadInflightRender, clearInflightRender, resumeInflightRender,
} from "../src/utils/inflightRender.ts";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const base = { workspaceId: "w1", jobIds: ["a", "b"], totalSpreads: 3, startedAt: 1 };

test("save/load/clear round trip", () => {
  const st = mem();
  assert.equal(loadInflightRender(st), null);
  saveInflightRender(base, st);
  assert.deepEqual(loadInflightRender(st), base);
  clearInflightRender(st);
  assert.equal(loadInflightRender(st), null);
});

test("garbage in storage is ignored", () => {
  const st = mem();
  st.setItem(INFLIGHT_RENDER_KEY, "{not json");
  assert.equal(loadInflightRender(st), null);
  st.setItem(INFLIGHT_RENDER_KEY, JSON.stringify({ ...base, jobIds: [] }));
  assert.equal(loadInflightRender(st), null);
});

function deps(over) {
  const log = { progress: [], finished: null };
  return { log, d: {
    getStatus: async () => ({ progress: 100, output: "output_02.png" }),
    listOutputs: async () => ({ outputs: ["output_01.png", "output_02.png", "output_03.png"] }),
    sleep: async () => {}, isCancelled: () => false,
    onProgress: (p, m) => log.progress.push([p, m]),
    onFinished: (o, m) => { log.finished = [o, m]; },
    ...over } };
}

test("resumes polling until the job finishes, then lists outputs", async () => {
  let n = 0;
  const { d, log } = deps({ getStatus: async () => (++n < 3 ? { progress: 50 } : { progress: 100, output: "output_02.png" }) });
  assert.equal(await resumeInflightRender(base, d), "resumed");
  assert.equal(log.progress.length, 2);
  assert.equal(log.progress[0][0], 50); // (1 + .5)/3
  assert.equal(log.finished[1], "Generation complete");
});

test("unknown job falls back to listing finished outputs", async () => {
  const { d, log } = deps({ getStatus: async () => { throw new Error("404"); }, listOutputs: async () => ({ outputs: ["output_01.png"] }) });
  assert.equal(await resumeInflightRender(base, d), "listed");
  assert.deepEqual(log.finished[0], ["output_01.png"]);
  assert.match(log.finished[1], /1 of 3 spreads are finished/);
});

test("job that errored reports partial result", async () => {
  const { d, log } = deps({ getStatus: async () => ({ error: "boom" }), listOutputs: async () => ({ outputs: ["output_01.png"] }) });
  assert.equal(await resumeInflightRender(base, d), "resumed");
  assert.match(log.finished[1], /stopped after 1 of 3/);
});
