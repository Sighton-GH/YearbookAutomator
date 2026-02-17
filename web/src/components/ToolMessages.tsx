import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { MESSAGE_ANIMATION_MS } from "../utils/messageAnimation";

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
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [closingById, setClosingById] = useState<Record<string, boolean>>({});
  const closeTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setOpenById((prev) => {
      const next: Record<string, boolean> = {};
      messages.forEach((m) => {
        next[m.id] = prev[m.id] ?? true;
      });
      return next;
    });
  }, [messages]);

  useEffect(() => {
    // Cleanup timers on unmount.
    return () => {
      const timers = closeTimersRef.current;
      Object.values(timers).forEach((t) => window.clearTimeout(t));
      closeTimersRef.current = {};
    };
  }, []);

  // Drop timers/state for messages that no longer exist.
  useEffect(() => {
    const ids = new Set(messages.map((m) => m.id));
    for (const [id, t] of Object.entries(closeTimersRef.current)) {
      if (!ids.has(id)) {
        window.clearTimeout(t);
        delete closeTimersRef.current[id];
      }
    }
    setClosingById((prev) => {
      const next: Record<string, boolean> = {};
      for (const [id, v] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = v;
      }
      return next;
    });
  }, [messages]);

  const isOpenNowById = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const m of messages) {
      out[m.id] = Boolean(openById[m.id] ?? true) || Boolean(closingById[m.id]);
    }
    return out;
  }, [closingById, messages, openById]);

  const cancelClose = (id: string) => {
    const t = closeTimersRef.current[id];
    if (t) window.clearTimeout(t);
    delete closeTimersRef.current[id];
    setClosingById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const beginClose = (id: string, opts?: { dismissAfter?: boolean }) => {
    const isOpen = Boolean(openById[id] ?? true);
    const isClosing = Boolean(closingById[id]);
    if (!isOpen || isClosing) {
      if (opts?.dismissAfter && onDismiss) onDismiss(id);
      return;
    }

    setClosingById((prev) => ({ ...prev, [id]: true }));
    const t = window.setTimeout(() => {
      delete closeTimersRef.current[id];
      setOpenById((prev) => ({ ...prev, [id]: false }));
      setClosingById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (opts?.dismissAfter && onDismiss) onDismiss(id);
    }, MESSAGE_ANIMATION_MS);
    closeTimersRef.current[id] = t;
  };

  const toggleMessage = (id: string, opts?: { dismissAfter?: boolean }) => {
    const isOpen = Boolean(openById[id] ?? true);
    if (isOpen) {
      beginClose(id, opts);
    } else {
      cancelClose(id);
      setOpenById((prev) => ({ ...prev, [id]: true }));
    }
  };

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

  if (!messages.length) return null;

  return (
    <div className="tool-messages" aria-label="Tool messages">
      {messages.map((m) => (
        <details
          key={m.id}
          className={clsx(
            "callout",
            calloutClass(m.kind),
            "tool-message",
            closingById[m.id] && "closing"
          )}
          open={isOpenNowById[m.id] ?? true}
          role={m.kind === "error" ? "alert" : "status"}
          aria-live={m.kind === "error" ? "assertive" : "polite"}
          onClick={(evt) => {
            // Auto-close after the user interacts with the body/actions.
            // (But don't close when they click the summary or toggle button.)
            if (!(openById[m.id] ?? true)) return;
            if (closingById[m.id]) return;
            const target = evt.target as HTMLElement | null;
            if (target && target.closest("summary")) return;
            // Interaction detected in body/actions area: auto-close
            beginClose(m.id);
          }}
        >
          <summary
            className="tool-message-summary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <span className="tool-message-icon" aria-hidden="true">{iconFor(m.kind)}</span>
            <span className="tool-message-summary-text">
              <strong className="tool-message-title">{m.title}</strong>
            </span>
            <span className="tool-message-controls">
              {m.kind === "warning" ? (
                <button
                  type="button"
                  className={clsx("tool-message-toggle", openById[m.id] !== false && !closingById[m.id] && "open")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMessage(m.id, { dismissAfter: Boolean(m.dismissible && onDismiss) });
                  }}
                  aria-label={Boolean(openById[m.id] !== false) ? "Collapse warning" : "Expand warning"}
                >
                  <svg className="tool-message-toggle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                className="tool-message-close"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginClose(m.id, { dismissAfter: Boolean(onDismiss) });
                }}
                aria-label="Dismiss message"
                title="Dismiss"
              >
                ×
              </button>
            </span>
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
