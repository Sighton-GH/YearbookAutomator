import type React from "react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

export type ToolMessageKind = "error" | "warning" | "info";

export type ToolMessage = {
  id: string;
  kind: ToolMessageKind;
  title: string;
  body?: string;
  actions?: React.ReactNode;
  dismissible?: boolean;
};

export function ToolMessages({
  messages,
  onDismiss,
}: {
  messages: ToolMessage[];
  onDismiss?: (id: string) => void;
}) {
  if (!messages.length) return null;

  const [openById, setOpenById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenById((prev) => {
      const next: Record<string, boolean> = {};
      messages.forEach((m) => {
        next[m.id] = prev[m.id] ?? true;
      });
      return next;
    });
  }, [messages]);

  const iconFor = (kind: ToolMessageKind) => {
    if (kind === "error") return "🛑";
    if (kind === "warning") return "⚠";
    return "ℹ";
  };

  const calloutClass = (kind: ToolMessageKind) => {
    if (kind === "error") return "danger";
    if (kind === "warning") return "warn";
    return "";
  };

  return (
    <div className="tool-messages" aria-label="Tool messages">
      {messages.map((m) => (
        <details
          key={m.id}
          className={clsx("callout", calloutClass(m.kind), "tool-message")}
          open={openById[m.id] ?? true}
          onToggle={(evt) => {
            const nextOpen = Boolean((evt.currentTarget as HTMLDetailsElement).open);
            setOpenById((prev) => ({ ...prev, [m.id]: nextOpen }));
          }}
          onClick={(evt) => {
            // Auto-collapse after the user interacts with the body/actions.
            // (But don't collapse when they click the summary toggler.)
            if (!(openById[m.id] ?? true)) return;
            const target = evt.target as HTMLElement | null;
            if (target && target.closest("summary")) return;
            setOpenById((prev) => ({ ...prev, [m.id]: false }));
          }}
          role={m.kind === "error" ? "alert" : "status"}
          aria-live={m.kind === "error" ? "assertive" : "polite"}
        >
          <summary className="tool-message-summary">
            <span className="tool-message-icon" aria-hidden="true">{iconFor(m.kind)}</span>
            <span className="tool-message-summary-text">
              <strong className="tool-message-title">{m.title}</strong>
            </span>
            {m.dismissible && onDismiss ? (
              <button
                type="button"
                className="tool-message-dismiss"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(m.id);
                }}
                aria-label="Dismiss message"
              >
                ✕
              </button>
            ) : null}
          </summary>

          {(m.body || m.actions) && (
            <div className="tool-message-details">
              {m.body ? <div className="tool-message-body">{m.body}</div> : null}
              {m.actions ? <div className="tool-message-actions">{m.actions}</div> : null}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
