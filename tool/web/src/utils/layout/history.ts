// F3.4: bounded undo/redo history over immutable snapshots. Pure and framework-free;
// hold the value in React state (useState / useReducer). Never persisted.

export const DEFAULT_HISTORY_LIMIT = 50;
export const MIN_HISTORY_LIMIT = 50;

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  limit: number;
  /** Key of the last coalesced push (e.g. a drag id); pushes with the same key replace `present`. */
  coalesceKey: string | null;
};

export function createHistory<T>(initial: T, limit: number = DEFAULT_HISTORY_LIMIT): History<T> {
  return { past: [], present: initial, future: [], limit: Math.max(MIN_HISTORY_LIMIT, Math.floor(limit) || 0), coalesceKey: null };
}

/**
 * Record a new state. Snapshots must be treated as immutable by callers.
 * - Identical reference to `present`: ignored.
 * - Structurally equal to `present` (JSON compare): ignored, so no empty undo steps.
 * - `coalesceKey`: successive pushes with the same key (a drag/resize/nudge burst) update
 *   `present` without adding steps; the first push of a burst adds one step.
 * Pushing clears redo. Oldest steps drop once past `limit`.
 */
export function pushHistory<T>(h: History<T>, next: T, coalesceKey: string | null = null): History<T> {
  if (next === h.present || JSON.stringify(next) === JSON.stringify(h.present)) return h;
  if (coalesceKey !== null && coalesceKey === h.coalesceKey && h.past.length > 0) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, present: next, future: [], coalesceKey };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  const previous = h.past[h.past.length - 1];
  return { ...h, past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], coalesceKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  const [next, ...rest] = h.future;
  return { ...h, past: [...h.past, h.present], present: next, future: rest, coalesceKey: null };
}

/** Replace state and clear all steps (e.g. new template uploaded, session restored). */
export function resetHistory<T>(h: History<T>, value: T): History<T> {
  return createHistory(value, h.limit);
}

/** Map a keydown to an action: Ctrl/Cmd-Z undo, Shift-Ctrl/Cmd-Z or Ctrl-Y redo. */
export function historyShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.metaKey) return "redo";
  return null;
}
