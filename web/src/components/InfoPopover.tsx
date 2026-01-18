import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";

export function InfoPopover({
  content,
  ariaLabel = "More info",
  position = "above",
  className,
}: {
  content: React.ReactNode;
  ariaLabel?: string;
  position?: "above" | "below";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const shiftRef = useRef(0);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (shiftRef.current !== 0) {
        shiftRef.current = 0;
        setShiftX(0);
      }
      return;
    }
    let raf = 0;
    const padding = 16;
    const reposition = () => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const baseLeft = rect.left - shiftRef.current;
      const baseRight = rect.right - shiftRef.current;
      let dx = 0;
      const maxRight = window.innerWidth - padding;
      if (baseRight > maxRight) dx -= baseRight - maxRight;
      if (baseLeft + dx < padding) dx += padding - (baseLeft + dx);
      if (dx !== shiftRef.current) {
        shiftRef.current = dx;
        setShiftX(dx);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reposition);
    };
    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
    };
  }, [open]);

  return (
    <span className={clsx("info-popover", className)} ref={rootRef}>
      <button
        type="button"
        className="info-popover-btn"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={ariaLabel}
          ref={panelRef}
          className={clsx("popover", "info-popover-panel", position === "below" && "below")}
          style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
        >
          <div className="info-popover-body">{content}</div>
          <button type="button" className="info-popover-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      ) : null}
    </span>
  );
}
