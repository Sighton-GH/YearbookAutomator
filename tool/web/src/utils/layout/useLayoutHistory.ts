import { useCallback, useState } from "react";
import type { TemplateSlots } from "../../api";
import type { PlacementMode } from "../../types";
import { remapLogicalAssignments } from "./slotNumbering";
import { canRedo, canUndo, createHistory, pushHistory, redo, resetHistory, undo } from "./history";

type Layout = {
  slots: TemplateSlots[];
  slotAssignments: Record<number, number>;
  parsedSlots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
};
/** App-owned so leaving the Template step does not discard layout history.
 * Slots and their logical assignments are one undoable transaction.
 * Parser metadata travels with snapshots so undoing a reparse restores its coordinate space.
 */
export function useLayoutHistory(placementMode: PlacementMode = "left_then_right") {
  const [history, setHistory] = useState(() => createHistory<Layout>({ slots: [], slotAssignments: {}, parsedSlots: [], templateSize: null }));
  const setSlots = useCallback((slots: TemplateSlots[], gestureKey?: string, order?: number[]) => {
    setHistory(h => pushHistory(h, {
      ...h.present, slots,
      slotAssignments: remapLogicalAssignments(h.present.slotAssignments, h.present.slots, slots,
        placementMode, order ?? slots.map((_, i) => i)),
    }, gestureKey));
  }, [placementMode]);
  const setSlotAssignments = useCallback((slotAssignments: Record<number, number>) => {
    // A later manual pin must not be overwritten by undoing an older layout edit.
    setHistory(h => resetHistory(h, { ...h.present, slotAssignments }));
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
  return { ...history.present, setSlotAssignments, setSlots, resetSlots, setParsedSlots, setTemplateSize, layoutHistory: { canUndo: canUndo(history), canRedo: canRedo(history), undo: undoSlots, redo: redoSlots } };
}
