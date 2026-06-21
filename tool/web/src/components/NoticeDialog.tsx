import type React from "react";
import { clsx } from "clsx";

export function NoticeDialog({
  open,
  title,
  message,
  actionLabel = "OK",
  onAction,
  secondaryLabel,
  onSecondary,
  emphasizeAction = true,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  actionLabel?: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  emphasizeAction?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={{ width: "min(620px, 100%)" }}>
        <div className="modal-header">
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: "1.15rem" }}>{title}</strong>
            {message ? <div style={{ fontSize: "1.05rem" }}>{message}</div> : null}
          </div>
        </div>
        <div className="modal-body">
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            {secondaryLabel && onSecondary ? (
              <button type="button" onClick={onSecondary}>
                {secondaryLabel}
              </button>
            ) : null}
            <button
              type="button"
              className={clsx(emphasizeAction && "primary")}
              onClick={onAction}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}