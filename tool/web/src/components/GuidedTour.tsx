import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type TourStep = {
  /** CSS selector of the element to spotlight. Omit for a centered, element-less step. */
  target?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 14;
const CARD_W = 320;

export function GuidedTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const measure = useCallback(() => {
    if (!open || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [open, step]);

  // Bring the target into view, then measure.
  useLayoutEffect(() => {
    if (!open || !step) return;
    if (step.target) {
      const el = document.querySelector(step.target) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    const t = window.setTimeout(measure, 280);
    return () => window.clearTimeout(t);
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && !isLast) setIndex((i) => i + 1);
      else if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, measure, isLast, index, onClose]);

  if (!open || !step) return null;

  // Position the tooltip card relative to the spotlight (or centred when no target).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: vh / 2, left: vw / 2, transform: "translate(-50%, -50%)" };
  } else {
    const placement = step.placement ?? (rect.left > vw / 2 ? "left" : "right");
    let top = rect.top;
    let left = rect.left;
    if (placement === "right") {
      left = rect.left + rect.width + GAP;
      top = rect.top + rect.height / 2;
    } else if (placement === "left") {
      left = rect.left - GAP - CARD_W;
      top = rect.top + rect.height / 2;
    } else if (placement === "bottom") {
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - CARD_W / 2;
    } else {
      top = rect.top - GAP;
      left = rect.left + rect.width / 2 - CARD_W / 2;
    }
    // Clamp into viewport.
    left = Math.max(GAP, Math.min(left, vw - CARD_W - GAP));
    top = Math.max(GAP, Math.min(top, vh - 200));
    const transform = placement === "left" || placement === "right" ? "translateY(-50%)" : placement === "top" ? "translateY(-100%)" : "none";
    cardStyle = { top, left, transform };
  }

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-scrim" onClick={onClose} />
      )}

      <div className="tour-card" style={cardStyle} ref={cardRef}>
        <button type="button" className="tour-close icon" aria-label="Close tour" onClick={onClose}>
          <X size={15} />
        </button>
        <div className="tour-step-count">
          Step {index + 1} of {steps.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i === index ? "tour-dot active" : "tour-dot"} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="ghost small" onClick={onClose}>
            Skip
          </button>
          <div className="tour-actions-right">
            {index > 0 && (
              <button type="button" className="small" onClick={() => setIndex((i) => i - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="primary small"
              onClick={() => (isLast ? onClose() : setIndex((i) => i + 1))}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
