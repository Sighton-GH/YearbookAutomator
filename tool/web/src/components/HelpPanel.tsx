import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, PlayCircle, Sparkles, ExternalLink, Loader2 } from "lucide-react";

const STEPS: { title: string; body: string }[] = [
  { title: "Template", body: "Upload your annotated guide + clean background. We detect each photo, name and quote slot by colour." },
  { title: "Roster & Photos", body: "Add your student spreadsheet and a ZIP of portrait photos. We match people to their pictures automatically." },
  { title: "People", body: "Review every match. Fix a portrait, edit a quote, or add baby photos — all from the side panel." },
  { title: "Style", body: "Choose fonts, sizes and alignment for names and quotes, with a live preview." },
  { title: "Generate", body: "Render print-ready spreads and download them as PNG, PDF or TIFF." },
];

export function HelpPanel({
  open,
  onClose,
  onReplayTour,
  onLoadSample,
  sampleBusy,
  websiteUrl,
}: {
  open: boolean;
  onClose: () => void;
  onReplayTour: () => void;
  onLoadSample: () => void;
  sampleBusy: boolean;
  websiteUrl: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Help">
      <div className="help-backdrop" onClick={onClose} />
      <aside className="help-panel">
        <div className="help-head">
          <h2>Help &amp; tips</h2>
          <button type="button" className="app-icon-btn square" aria-label="Close help" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="help-body">
          <section>
            <div className="help-section-title">Get started</div>
            <div className="help-actions">
              <button type="button" onClick={onLoadSample} disabled={sampleBusy}>
                {sampleBusy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                {sampleBusy ? "Loading sample…" : "Load a sample project"}
              </button>
              <button type="button" onClick={onReplayTour}>
                <PlayCircle size={16} /> Replay the guided tour
              </button>
            </div>
            <p className="muted small" style={{ marginTop: "var(--space-2)" }}>
              The sample fills the tool with an example template, roster and photos so you can see how it works.
            </p>
          </section>

          <section>
            <div className="help-section-title">How it works</div>
            <div className="help-steps">
              {STEPS.map((s, i) => (
                <div className="help-step" key={s.title}>
                  <span className="help-step-num">{i + 1}</span>
                  <span className="help-step-text">
                    <strong>{s.title}</strong>
                    <span>{s.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="help-section-title">More</div>
            <div className="help-actions">
              <a className="app-icon-btn" href={websiteUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <ExternalLink size={16} /> Full documentation
              </a>
            </div>
            <p className="muted small" style={{ marginTop: "var(--space-2)" }}>
              Look for the <strong>?</strong> icons throughout the tool for tips on each setting.
            </p>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
