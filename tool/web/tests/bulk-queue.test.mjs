import test from "node:test";
import assert from "node:assert/strict";
import {runBulkQueue} from "../src/utils/bulkQueue.ts";

const base = (over = {}) => {
  const calls = {cancel: [], aspects: [], applied: [], uploads: 0};
  const signal = {stopped: false};
  const run = {
    mode: "face", signal, items: [{index: 0, filename: "a.png"}, {index: 1, filename: "b.png"}, {index: 2, filename: null}],
    deps: {
      startJob: async () => ({job_id: "j1"}), jobStatus: async () => ({status: "done", progress: 100, output_filename: "out.png"}),
      cancelJob: async id => {calls.cancel.push(id);}, fetchPhoto: async () => new Blob(["x"]),
      centre: async (_b, aspect) => {calls.aspects.push(aspect); return new Blob(["y"]);},
      upload: async () => {calls.uploads++; return `up${calls.uploads}.png`;}, sleep: async () => {}, now: () => 0,
    },
    aspectFor: i => (i === 0 ? 0.5 : 2), skipNow: () => false,
    apply: (i, from, out) => {calls.applied.push([i, from, out]); return true;}, onProgress() {}, onJob() {}, ...over,
  };
  return {run, calls, signal};
};

test("uses each person's own aspect", async () => {
  const {run, calls} = base(); const r = await runBulkQueue(run);
  assert.deepEqual(calls.aspects, [0.5, 2]); assert.equal(r.completed, 3); assert.equal(r.skipped, 1);
});
test("stop mid face-centre neither uploads, applies nor counts the in-flight person", async () => {
  const {run, calls, signal} = base(); run.deps.centre = async () => {signal.stopped = true; return new Blob(["y"]);};
  const r = await runBulkQueue(run);
  assert.equal(calls.uploads, 0); assert.deepEqual(calls.applied, []); assert.equal(r.completed, 0); assert.equal(r.stopped, true); assert.equal(r.failures, 0);
});
test("stop while polling cancels the job, applies nothing, is not a failure", async () => {
  const {run, calls, signal} = base({mode: "background"});
  run.deps.jobStatus = async () => {signal.stopped = true; return {status: "running", progress: 10};};
  const r = await runBulkQueue(run);
  assert.deepEqual(calls.cancel, ["j1"]); assert.deepEqual(calls.applied, []); assert.equal(r.failures, 0); assert.equal(r.completed, 0);
});
test("unmount while the job is still starting still cancels the job once it exists", async () => {
  const {run, calls, signal} = base({mode: "background"});
  run.deps.startJob = async () => {signal.stopped = true; return {job_id: "late"};};
  await runBulkQueue(run); assert.deepEqual(calls.cancel, ["late"]); assert.deepEqual(calls.applied, []);
});
test("a person whose photo changed or who got locked meanwhile is not overwritten", async () => {
  let locked = false;
  const {run, calls} = base({skipNow: i => i === 0 && locked});
  run.deps.upload = async () => {locked = true; return "u.png";};
  const r = await runBulkQueue(run);
  assert.equal(calls.applied.some(a => a[0] === 0), false); assert.ok(r.skipped >= 2);
});
test("an API failure stops the queue and reports one failure", async () => {
  const {run} = base(); run.deps.upload = async () => {throw new Error("boom");};
  const r = await runBulkQueue(run);
  assert.equal(r.failures, 1); assert.equal(r.stopped, true); assert.equal(r.error, "boom"); assert.equal(r.completed, 1);
});
test("error job status cancels nothing extra but fails once", async () => {
  const {run, calls} = base({mode: "background"}); run.deps.jobStatus = async () => ({status: "error", progress: 0, error: "bad"});
  const r = await runBulkQueue(run); assert.equal(r.failures, 1); assert.deepEqual(calls.cancel, ["j1"]);
});
