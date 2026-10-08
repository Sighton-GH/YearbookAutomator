import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatLockCountdown } from "../utils/licenseErrors";

export function LockConflictScreen({
  message,
  lockExpiresAt,
  busy,
  error,
  onRetry,
  onTakeover,
}: {
  message: string;
  /** Unix seconds. */
  lockExpiresAt?: number | null;
  busy: boolean;
  error?: string;
  onRetry: () => void;
  onTakeover: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!lockExpiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockExpiresAt]);

  const remainingMs = lockExpiresAt ? lockExpiresAt * 1000 - now : 0;
  const expired = Boolean(lockExpiresAt) && remainingMs <= 0;

  return (
    <div className="app-loading" role="alert">
      <div>{message}</div>
      {lockExpiresAt ? (
        <div style={{ marginTop: 6, opacity: 0.8 }}>
          Lock expires at {new Date(lockExpiresAt * 1000).toLocaleTimeString()}.{" "}
          {expired ? (
            "It should be free now \u2014 try again."
          ) : (
            <>
              <span aria-hidden="true">Time left: {formatLockCountdown(remainingMs)}</span>
            </>
          )}
        </div>
      ) : null}
      {error ? <div style={{ marginTop: 6 }}>{error}</div> : null}
      <div className="actions" style={{ justifyContent: "center", marginTop: 12 }}>
        <button type="button" className="primary" onClick={onRetry} disabled={busy}>
          {busy ? "Trying\u2026" : "Try again"}
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={busy}>
          Take over this session
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Take over this session?"
        message="The other device will be disconnected and any unsaved work there will be lost."
        confirmLabel="Take over"
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onTakeover();
        }}
      />
    </div>
  );
}
