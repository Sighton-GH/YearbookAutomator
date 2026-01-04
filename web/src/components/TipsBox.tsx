import { useEffect, useMemo, useState } from "react";

export function TipsBox({ tips }: { tips: string[] }) {
  const stableTips = useMemo(() => tips.filter((t) => t.trim()), [tips]);
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (stableTips.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % stableTips.length);
    }, 5500);
    return () => window.clearInterval(t);
  }, [open, stableTips.length]);

  useEffect(() => {
    if (idx >= stableTips.length) setIdx(0);
  }, [idx, stableTips.length]);

  if (!open) return null;
  if (!stableTips.length) return null;

  return (
    <div className="tips-box" role="status" aria-label="Tips">
      <div className="tips-box-header">
        <strong>Tips</strong>
        <button type="button" className="tips-box-close" onClick={() => setOpen(false)} aria-label="Close tips">
          ✕
        </button>
      </div>
      <div className="tips-box-body">{stableTips[idx] ?? ""}</div>
    </div>
  );
}
