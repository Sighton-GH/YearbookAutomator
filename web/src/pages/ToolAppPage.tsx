import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import App from "../App";
import { withBase } from "../baseUrl";
import { getStoredLicenseKey, validateLicenseKey } from "../licensing";
import { ToggleSwitch } from "../components/ToggleSwitch";

type SessionTimingDetail = {
  remainingMs: number;
  expiresAtMs: number;
  ttlMs: number;
};

const formatSessionCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
};

const formatSessionExpiryTime = (expiresAtMs: number): string => {
  return new Date(expiresAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function ToolAppPage() {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [sessionTiming, setSessionTiming] = useState<SessionTimingDetail | null>(null);
  const [sessionInfoCollapsed, setSessionInfoCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ymga-session-info-collapsed") === "1";
  });
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("ymga-app-theme") === "dark" ? "dark" : "light";
  });
  const isDark = appTheme === "dark";

  const triggerConfigAction = (kind: "export" | "import") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(kind === "export" ? "ymga:save-config" : "ymga:upload-config"));
  };

  useEffect(() => {
    let active = true;
    const key = getStoredLicenseKey();
    if (!key) {
      setValid(false);
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const res = await validateLicenseKey(key);
        if (!active) return;
        setValid(Boolean(res.valid));
      } catch {
        if (!active) return;
        setValid(false);
      } finally {
        if (!active) return;
        setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymga-app-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymga-session-info-collapsed", sessionInfoCollapsed ? "1" : "0");
  }, [sessionInfoCollapsed]);

  useEffect(() => {
    const onSessionTiming = (event: Event) => {
      const detail = (event as CustomEvent<SessionTimingDetail>).detail;
      if (!detail || typeof detail !== "object") return;
      if (!Number.isFinite(detail.remainingMs) || !Number.isFinite(detail.expiresAtMs) || !Number.isFinite(detail.ttlMs)) {
        return;
      }
      setSessionTiming({
        remainingMs: Math.max(0, Number(detail.remainingMs)),
        expiresAtMs: Number(detail.expiresAtMs),
        ttlMs: Math.max(60_000, Number(detail.ttlMs)),
      });
    };

    window.addEventListener("ymga:session-timing", onSessionTiming as EventListener);
    return () => {
      window.removeEventListener("ymga:session-timing", onSessionTiming as EventListener);
    };
  }, []);

  const remainingMs = sessionTiming?.remainingMs ?? 0;
  const sessionToneClass = remainingMs <= 5 * 60 * 1000 ? " danger" : remainingMs <= 30 * 60 * 1000 ? " warn" : "";

  if (!checking && !valid) return <Navigate to="/tool" replace />;

  return (
    <div className={`app-shell${isDark ? " dark" : ""}`}>
      <div className="app-return-bar">
        <div className="app-return-inner">
          <div className="app-title-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={withBase("assets/Sighton_Logo.png")}
              alt="Sighton logo"
              style={{ width: 28, height: 28, objectFit: "contain" }}
            />
            <span className="app-title">Custom Flow Automator</span>
            <div className="app-file-actions" aria-label="Configuration">
              <button
                type="button"
                className="app-file-action"
                onClick={() => triggerConfigAction("export")}
                disabled={checking}
              >
                Export
              </button>
              <button
                type="button"
                className="app-file-action"
                onClick={() => triggerConfigAction("import")}
                disabled={checking}
              >
                Import
              </button>
            </div>
            {sessionTiming ? (
              <div className={`app-session-inline${sessionToneClass}`} role="status" aria-live="polite">
                <span className="app-session-label">Session</span>
                <span className="app-session-meta">
                  Remaining: {formatSessionCountdown(sessionTiming.remainingMs)}
                  {!sessionInfoCollapsed ? ` · Expires at ${formatSessionExpiryTime(sessionTiming.expiresAtMs)}` : ""}
                </span>
                <button
                  type="button"
                  className="app-session-toggle"
                  onClick={() => setSessionInfoCollapsed((v) => !v)}
                  aria-label={sessionInfoCollapsed ? "Expand session information" : "Collapse session information"}
                >
                  {sessionInfoCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="app-return-actions">
            <ToggleSwitch
              className="app-theme-toggle-switch"
              checked={isDark}
              onChange={(next) => setAppTheme(next ? "dark" : "light")}
              label="Dark mode"
            />
            <a className="app-return-link" href={withBase("/")}>Back to main website</a>
          </div>
        </div>
      </div>
      {checking ? (
        <div className="app-loading">Validating license…</div>
      ) : (
        <App embedded />
      )}
      <footer className="app-footer">
        <div className="app-footer-inner" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={withBase("assets/Sighton_Logo.png")}
            alt="Sighton logo"
            style={{ width: 20, height: 20, objectFit: "contain" }}
          />
          <span>Sighton Innovations</span>
        </div>
      </footer>
    </div>
  );
}
