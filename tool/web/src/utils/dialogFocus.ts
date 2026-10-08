// Focus management for modal dialogs and the guided tour (P3-21).
import { useEffect, type RefObject } from "react";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Index to focus when Tab / Shift+Tab is pressed, or null to let the browser move focus normally. */
export function nextTrapIndex(current: number, count: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0) return shift ? count - 1 : 0; // focus is outside the dialog: pull it in
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * While `open`: move focus into the dialog, keep Tab inside it, call onEscape on Escape,
 * and return focus to the previously focused element on close.
 * `refocusKey` re-runs the initial focus (e.g. when a tour step changes).
 */
export function useDialogFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement>,
  onEscape: () => void,
  refocusKey?: unknown,
): void {
  // Remember and restore the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // Initial focus.
  useEffect(() => {
    if (!open) return;
    const root = containerRef.current;
    if (!root) return;
    const items = focusables(root);
    (items[0] ?? root).focus();
  }, [open, refocusKey, containerRef]);

  // Escape + Tab trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const items = focusables(root);
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next = nextTrapIndex(idx, items.length, e.shiftKey);
      if (next !== null) {
        e.preventDefault();
        items[next].focus();
      } else if (items.length === 0) {
        e.preventDefault();
        root.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onEscape, containerRef]);
}
