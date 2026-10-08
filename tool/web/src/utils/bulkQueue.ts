// Sequential baby-photo queue for the People tab bulk toolbar. Kept free of React so the
// ownership rules (stop, unmount, workspace change, stale people, per-person aspect) are unit tested.
export type QueueMode = "background" | "face";
export interface QueueItem {index: number; filename: string | null}
export interface QueueDeps {
  startJob(filename: string): Promise<{job_id: string}>;
  jobStatus(jobId: string): Promise<{status: string; progress: number; output_filename?: string | null; error?: string | null; message?: string | null}>;
  cancelJob(jobId: string): Promise<unknown>;
  fetchPhoto(filename: string): Promise<Blob>;
  centre(blob: Blob, aspect: number): Promise<Blob | null>;
  upload(blob: Blob): Promise<string>;
  sleep(ms: number): Promise<void>;
  now(): number;
}
export interface QueueRun {
  mode: QueueMode;
  items: QueueItem[];
  deps: QueueDeps;
  /** Set true by Stop, unmount or a workspace change. Checked after every await. */
  signal: {stopped: boolean};
  /** Aspect of the baby slot this person is placed in, read fresh for each person. */
  aspectFor(index: number): number;
  /** True when the person is locked or gone now (checked just before and just after processing). */
  skipNow(index: number, sourceFilename: string): boolean;
  /** Apply a result only if the person still has the source photo; returns whether it was applied. */
  apply(index: number, sourceFilename: string, output: string): boolean;
  onProgress(percent: number): void;
  onJob(jobId: string | null): void;
  pollMs?: number;
  timeoutMs?: number;
}
export interface QueueResult {completed: number; skipped: number; failures: number; stopped: boolean; error: string | null}

export async function runBulkQueue(run: QueueRun): Promise<QueueResult> {
  const {items, deps, signal} = run;
  const result: QueueResult = {completed: 0, skipped: 0, failures: 0, stopped: false, error: null};
  const total = Math.max(1, items.length);
  const finish = () => {result.completed++; run.onProgress(result.completed / total * 100);};
  for (const item of items) {
    if (signal.stopped) break;
    const filename = item.filename;
    if (!filename || run.skipNow(item.index, filename)) {result.skipped++; finish(); continue;}
    let jobId: string | null = null;
    try {
      let output: string | null = null;
      if (run.mode === "background") {
        const job = await deps.startJob(filename);
        jobId = job.job_id; run.onJob(jobId);
        const deadline = deps.now() + (run.timeoutMs ?? 10 * 60 * 1000);
        while (!signal.stopped) {
          const status = await deps.jobStatus(jobId);
          if (signal.stopped) break;
          run.onProgress((result.completed + status.progress / 100) / total * 100);
          if (status.status === "done" && status.output_filename) {output = status.output_filename; break;}
          if (status.status === "error" || status.status === "cancelled" || status.error) throw new Error(status.error || status.message || "Photo processing stopped");
          if (deps.now() > deadline) throw new Error("Photo processing timed out");
          await deps.sleep(run.pollMs ?? 1000);
        }
        if (signal.stopped && !output) {await deps.cancelJob(jobId).catch(() => undefined);}
        jobId = null; run.onJob(null);
      } else {
        const blob = await deps.fetchPhoto(filename);
        if (signal.stopped) break;
        const centred = await deps.centre(blob, run.aspectFor(item.index));
        if (signal.stopped) break;
        if (centred) output = await deps.upload(centred); else result.skipped++;
      }
      if (signal.stopped) break; // the in-flight person is not counted or applied
      if (output) {
        if (!run.skipNow(item.index, filename) && run.apply(item.index, filename, output)) {/* applied */} else result.skipped++;
      }
    } catch (err) {
      if (jobId) {await deps.cancelJob(jobId).catch(() => undefined); jobId = null; run.onJob(null);}
      if (signal.stopped) break; // failure caused by Stop/unmount is not a user-visible failure
      result.failures++; result.error = err instanceof Error ? err.message : String(err);
      signal.stopped = true; // stop on an API refusal rather than hammering the endpoint
      result.completed++; run.onProgress(result.completed / total * 100);
      break;
    }
    finish();
  }
  result.stopped = signal.stopped;
  return result;
}
