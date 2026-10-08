import { useRef } from "react";
import { useDialogFocus } from "../utils/dialogFocus";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onCancel);
  if (!open) return null;

  return (
    <div ref={dialogRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
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
