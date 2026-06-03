import type React from "react";
import { clsx } from "clsx";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={{ width: "min(560px, 100%)" }}>
        <div className="modal-header">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{title}</strong>
            {message ? <div className="muted small">{message}</div> : null}
          </div>
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
        <div className="modal-body">
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className={clsx(destructive && "danger")} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
