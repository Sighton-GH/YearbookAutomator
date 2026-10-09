import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

export function TipsBox({ tips }: { tips: string[] }) {
  const stableTips = useMemo(() => {
    const cleaned = tips.filter((t) => t.trim());
    if (cleaned.length <= 1) return cleaned;
    const shuffled = [...cleaned];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [tips]);
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [prevIdx, setPrevIdx] = useState(0);
  const autoplayTimerRef = useRef<number | null>(null);

  // Auto-advance tips when open
  useEffect(() => {
    if (!open || paused || stableTips.length <= 1) return;

    autoplayTimerRef.current = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % stableTips.length);
    }, 5500);

    return () => {
      if (autoplayTimerRef.current) window.clearInterval(autoplayTimerRef.current);
    };
  }, [open, paused, stableTips.length]);

  // Track previous index for scroll direction
  useEffect(() => {
    if (idx !== prevIdx) {
      setPrevIdx(idx);
    }
  }, [idx, prevIdx]);

  const handleClose = () => {
    setIsClosing(true);
    const t = window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 400);
    return () => window.clearTimeout(t);
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleNext = () => {
    if (autoplayTimerRef.current) window.clearInterval(autoplayTimerRef.current);
    setIdx((prev) => (prev + 1) % stableTips.length);
  };

  const handlePrev = () => {
    if (autoplayTimerRef.current) window.clearInterval(autoplayTimerRef.current);
    setIdx((prev) => (prev - 1 + stableTips.length) % stableTips.length);
  };

  if (!stableTips.length) return null;

  if (!open && !isClosing) {
    return (
      <button
        type="button"
        className="tips-box-show"
        onClick={handleOpen}
        aria-label="Show tips"
      >
        Show tips
      </button>
    );
  }

  const autoRotating = !paused && stableTips.length > 1;
  const isMovingForward = idx > prevIdx || (prevIdx === stableTips.length - 1 && idx === 0);
  const scrollDirection = isMovingForward ? "forward" : "backward";

  return (
    <div
      className={clsx("tips-box", isClosing && "closing")}
      role="status"
      aria-live={autoRotating ? "off" : "polite"}
      aria-label="Tips"
    >
      <div className="tips-box-header">
        <strong className="tips-box-title">Did you know...</strong>
        {stableTips.length > 1 ? (
          <button
            type="button"
            className="tips-box-close"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            aria-label={paused ? "Resume automatic tips" : "Pause automatic tips"}
          >
            {paused ? "Play" : "Pause"}
          </button>
        ) : null}
        <button
          type="button"
          className="tips-box-close"
          onClick={handleClose}
          aria-label="Close tips"
        >
          ✕
        </button>
      </div>

      <div className="tips-box-container">
        <button
          type="button"
          className="tips-box-nav tips-box-nav-left"
          onClick={handlePrev}
          aria-label="Previous tip"
          disabled={stableTips.length <= 1}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          className={clsx(
            "tips-box-body",
            `scroll-${scrollDirection}`
          )}
          key={`tip-${idx}`}
        >
          {stableTips[idx] ?? ""}
        </div>

        <button
          type="button"
          className="tips-box-nav tips-box-nav-right"
          onClick={handleNext}
          aria-label="Next tip"
          disabled={stableTips.length <= 1}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9 18L15 12L9 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
