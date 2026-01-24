import type React from "react";

export function ImagePreviewDialog({
  open,
  title,
  imageUrl,
  onClose,
  onCancel,
  cancelLabel = "Cancel",
  onRotateClockwise,
  onRotateCounterClockwise,
  busy = false,
  hint,
}: {
  open: boolean;
  title: string;
  imageUrl: string | null;
  onClose: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  onRotateClockwise?: () => void | Promise<void>;
  onRotateCounterClockwise?: () => void | Promise<void>;
  busy?: boolean;
  hint?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={{ width: "min(900px, 100%)" }}>
        <div className="modal-header">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{title}</strong>
            {hint ? <div className="muted small">{hint}</div> : null}
          </div>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <div className="stack" style={{ gap: 12 }}>
            <div
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: 8,
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: "min(70vh, 800px)",
                    objectFit: "contain",
                    display: "block",
                    borderRadius: 8,
                    margin: "0 auto",
                  }}
                />
              ) : (
                <div className="muted small">No preview available.</div>
              )}
            </div>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              {onCancel ? (
                <button type="button" onClick={onCancel} disabled={busy}>
                  {cancelLabel}
                </button>
              ) : null}
              {onRotateCounterClockwise ? (
                <button type="button" onClick={onRotateCounterClockwise} disabled={busy}>
                  {busy ? "⟳" : "↺"}
                </button>
              ) : null}
              {onRotateClockwise ? (
                <button type="button" onClick={onRotateClockwise} disabled={busy}>
                  {busy ? "⟳" : "↻"}
                </button>
              ) : null}
              <button type="button" onClick={onClose} disabled={busy}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}