import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Inspector({
  title,
  subtitle,
  icon,
  onClose,
  children,
  empty,
  emptyIcon,
  emptyTitle,
  emptyHint,
}: {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose?: () => void;
  children?: ReactNode;
  empty?: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  return (
    <aside className="inspector-panel" aria-label="Inspector">
      {empty ? (
        <div className="inspector-empty">
          {emptyIcon}
          {emptyTitle && <p className="inspector-empty-title">{emptyTitle}</p>}
          {emptyHint && <p className="inspector-empty-hint">{emptyHint}</p>}
        </div>
      ) : (
        <>
          <div className="inspector-header">
            <div className="inspector-header-text">
              {icon}
              <div>
                {title && <h3>{title}</h3>}
                {subtitle && <p className="muted small">{subtitle}</p>}
              </div>
            </div>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close inspector">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="inspector-body">{children}</div>
        </>
      )}
    </aside>
  );
}
