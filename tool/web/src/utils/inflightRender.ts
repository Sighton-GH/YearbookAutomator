// Remembers an in-flight "Render all" so a page reload can pick it back up (P3-13).
// Stored in sessionStorage: it belongs to this browser tab only.

export const INFLIGHT_RENDER_KEY = "ymga.inflightRender.v1";

export type InflightRender = {
  workspaceId: string;
  jobIds: string[];
  totalSpreads: number;
  startedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function saveInflightRender(state: InflightRender, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(INFLIGHT_RENDER_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: resuming is a nicety, never block rendering */
  }
}

export function clearInflightRender(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(INFLIGHT_RENDER_KEY);
  } catch {
    /* ignore */
  }
}

export function loadInflightRender(storage: StorageLike | null = defaultStorage()): InflightRender | null {
  try {
    const raw = storage?.getItem(INFLIGHT_RENDER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<InflightRender>;
    if (
      !v ||
      typeof v.workspaceId !== "string" ||
      !v.workspaceId ||
      !Array.isArray(v.jobIds) ||
      !v.jobIds.every((j) => typeof j === "string" && j) ||
      v.jobIds.length === 0 ||
      typeof v.totalSpreads !== "number" ||
      !(v.totalSpreads >= 1) ||
      typeof v.startedAt !== "number"
    ) {
      return null;
    }
    return { workspaceId: v.workspaceId, jobIds: v.jobIds, totalSpreads: v.totalSpreads, startedAt: v.startedAt };
  } catch {
    return null;
  }
}

type JobStatus = { progress?: number; status?: string; output?: string | null; error?: string | null };

export type ResumeDeps = {
  getStatus: (jobId: string) => Promise<JobStatus>;
  listOutputs: (workspaceId: string) => Promise<{ outputs: string[] }>;
  sleep: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  onProgress: (pct: number, message: string) => void;
  onFinished: (outputs: string[], message: string) => void;
  pollMs?: number;
};

/**
 * Re-attach to the last job of an interrupted Render all. Returns "resumed" when the server
 * still knew the job and it ran to the end, otherwise "listed" (we showed what finished).
 * Only the job that was running at reload time can be re-attached; spreads that had not
 * started are not queued on the server, so they are reported as still to do.
 */
export async function resumeInflightRender(
  state: InflightRender,
  deps: ResumeDeps,
): Promise<"resumed" | "listed"> {
  const lastJob = state.jobIds[state.jobIds.length - 1];
  const doneBefore = Math.max(0, state.jobIds.length - 1);
  const total = Math.max(1, state.totalSpreads);
  let known = false;
  let failed: string | null = null;
  let lastOutput: string | null = null;

  while (!deps.isCancelled()) {
    let st: JobStatus | null = null;
    try {
      st = await deps.getStatus(lastJob);
    } catch {
      st = null; // unknown job (e.g. server restarted) or transient error
    }
    if (!st || (st as { error?: string }).error === "not found") break;
    known = true;
    if (st.error) {
      failed = st.error;
      break;
    }
    const spreadPct = Math.max(0, Math.min(100, typeof st.progress === "number" ? st.progress : 0));
    const overall = Math.round(((doneBefore + spreadPct / 100) / total) * 100);
    if (st.output) {
      lastOutput = st.output;
      break;
    }
    deps.onProgress(
      overall,
      `Spread ${doneBefore + 1}/${total} — picked up again after a reload — Overall ${overall}%`,
    );
    await deps.sleep(deps.pollMs ?? 400);
  }
  if (deps.isCancelled()) return known ? "resumed" : "listed";

  let outputs: string[] = [];
  try {
    outputs = (await deps.listOutputs(state.workspaceId)).outputs.filter((o) => typeof o === "string" && o.trim());
  } catch {
    outputs = lastOutput ? [lastOutput] : [];
  }
  const finished = outputs.length;
  let message: string;
  if (failed) {
    message = `Rendering stopped after ${finished} of ${state.totalSpreads} spreads. The finished spreads are listed below; press Render all again to redo the rest.`;
  } else if (finished >= state.totalSpreads) {
    message = "Generation complete";
  } else {
    message = `The page was reloaded during rendering. ${finished} of ${state.totalSpreads} spreads are finished and listed below. Press Render all to render the rest.`;
  }
  deps.onFinished(outputs, message);
  return known ? "resumed" : "listed";
}
