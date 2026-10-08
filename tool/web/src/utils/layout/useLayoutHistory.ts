import { useCallback, useState } from "react";
import type { TemplateSlots } from "../../api";
import { canRedo, canUndo, createHistory, pushHistory, redo, resetHistory, undo } from "./history";

type Layout = {
  slots: TemplateSlots[];
  parsedSlots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
};
/** App-owned so leaving the Template step does not discard layout history.
 * Assignments are logical fill numbers, not array identities, and remain unchanged.
 * Parser metadata travels with snapshots so undoing a reparse restores its coordinate space.
 */
export function useLayoutHistory() {
  const [history, setHistory] = useState(() => createHistory<Layout>({ slots: [], parsedSlots: [], templateSize: null }));
  const setSlots = useCallback((slots: TemplateSlots[], gestureKey?: string) => {
    setHistory(h => pushHistory(h, { ...h.present, slots }, gestureKey));
  }, []);
  const resetSlots = useCallback((slots: TemplateSlots[]) => {
    setHistory(h => resetHistory(h, { ...h.present, slots }));
  }, []);
  // These setters attach metadata to the current parse/restore transaction without extra undo steps.
  const setParsedSlots = useCallback((parsedSlots: TemplateSlots[]) => {
    setHistory(h => ({ ...h, present: { ...h.present, parsedSlots } }));
  }, []);
  const setTemplateSize = useCallback((templateSize: Layout["templateSize"]) => {
    setHistory(h => ({ ...h, present: { ...h.present, templateSize } }));
  }, []);
  const undoSlots = useCallback(() => setHistory(h => undo(h)), []);
  const redoSlots = useCallback(() => setHistory(h => redo(h)), []);
  return { ...history.present, setSlots, resetSlots, setParsedSlots, setTemplateSize, layoutHistory: { canUndo: canUndo(history), canRedo: canRedo(history), undo: undoSlots, redo: redoSlots } };
}
