import { useEffect, useMemo, useRef, useState } from "react";
import App from "../App";
import { withBase } from "../baseUrl";
import { WEBSITE_URL } from "../env";
import { releaseWorkspace, resolveWorkspace } from "../api";
import {
  getOrCreateClientSessionId,
  getStoredLicenseKey,
  requestFreePersonalKey,
  setStoredLicenseKey,
  validateLicenseKey,
} from "../licensing";
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
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
  const [resolvedLicenseType, setResolvedLicenseType] = useState<"personal" | "commercial" | null>(null);
  const [lockConflict, setLockConflict] = useState<{ message: string; lockExpiresAt?: number | null } | null>(null);
  const [clientSessionId] = useState<string>(() => getOrCreateClientSessionId());
  const [releasingWorkspace, setReleasingWorkspace] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionInfoCollapsed, setSessionInfoCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ymga-session-info-collapsed") === "1";
  });
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("ymga-app-theme") === "dark" ? "dark" : "light";
  });
  const isDark = appTheme === "dark";
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionInfoRef = useRef<HTMLDivElement | null>(null);

  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const trimmedLicenseInput = useMemo(() => licenseKeyInput.trim(), [licenseKeyInput]);

  const triggerConfigAction = (kind: "export" | "import") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(kind === "export" ? "ymga:save-config" : "ymga:upload-config"));
  };

  // Validates a key and, if valid, persists it and resolves a workspace for it.
  // Shared by the initial mount check and the manual entry form below.
  const activateLicense = async (key: string) => {
    const res = await validateLicenseKey(key);
    if (!res.valid) {
      setValid(false);
      return res;
    }

    setStoredLicenseKey(key);
    setValid(true);

    try {
      const resolved = await resolveWorkspace(clientSessionId);
      setResolvedWorkspaceId(resolved.workspace_id || null);
      setResolvedLicenseType(resolved.license_type || null);
      setLockConflict(null);
    } catch (err: any) {
      const code = err?.response?.data?.detail?.code;
      if (code === "workspace_locked") {
        const lockExpiresAt = Number(err?.response?.data?.detail?.lock_expires_at || 0) || null;
        setLockConflict({
          message:
            "Workspace tied to this commercial license is already in use. Ask the other user to disconnect, release the workspace, or wait for lock timeout.",
          lockExpiresAt,
        });
        setResolvedWorkspaceId(null);
      } else {
        setLockConflict({ message: "Could not resolve workspace for this license. Please refresh and try again." });
      }
    }

    return res;
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
        await activateLicense(key);
      } catch {
        if (active) setValid(false);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleValidateClick = async () => {
    if (!trimmedLicenseInput) return;
    setLicenseBusy(true);
    setLicenseError("");
    try {
      const res = await activateLicense(trimmedLicenseInput);
      if (!res.valid) {
        setLicenseError(res.reason ? `Invalid license key (${res.reason}).` : "Invalid license key.");
      }
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Could not validate license key");
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleFreeKeyClick = async () => {
    setLicenseBusy(true);
    setLicenseError("");
    try {
      const key = await requestFreePersonalKey();
      setLicenseKeyInput(key);
      const res = await activateLicense(key);
      if (!res.valid) {
        setLicenseError(res.reason ? `Invalid license key (${res.reason}).` : "Invalid license key.");
      }
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Could not create free key");
    } finally {
      setLicenseBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymga-app-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymga-session-info-collapsed", sessionInfoCollapsed ? "1" : "0");
  }, [sessionInfoCollapsed]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (sessionInfoCollapsed) return;

    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sessionInfoRef.current && !sessionInfoRef.current.contains(target)) {
        setSessionInfoCollapsed(true);
      }
    };

    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSessionInfoCollapsed(true);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [sessionInfoCollapsed]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

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
  const showSessionExpiry = Boolean(resolvedLicenseType === "commercial" && resolvedWorkspaceId);

  if (!checking && !valid) {
    return (
      <div className="app-shell">
        <section className="tool-launch">
          <div className="tool-launch-card">
            <div className="stack" style={{ gap: 6 }}>
              <h2>License required</h2>
              <p className="muted">Enter a license key to unlock the tool.</p>
            </div>

            <label className="field">
              <span>License key</span>
              <input
                value={licenseKeyInput}
                onChange={(e) => {
                  setLicenseKeyInput(e.target.value);
                  setLicenseError("");
                }}
                placeholder="YMGA1-..."
                disabled={licenseBusy}
              />
            </label>

            {licenseError && <div className="callout danger">{licenseError}</div>}

            <div className="actions tool-launch-actions">
              <button type="button" onClick={() => void handleValidateClick()} disabled={licenseBusy || !trimmedLicenseInput}>
                {licenseBusy ? "Validating..." : "Validate license"}
              </button>
              <button type="button" onClick={() => void handleFreeKeyClick()} disabled={licenseBusy}>
                Get free personal (non-commercial) key
              </button>
            </div>

            <div className="muted small">
              Free personal keys are intended for personal, non-commercial use and are limited to 5 uses per month.
              Commercial usage requires a paid key.
            </div>

            <a className="app-return-link" href={WEBSITE_URL}>
              Back to main website
            </a>
          </div>
        </section>
      </div>
    );
  }

  const handleReleaseWorkspace = async () => {
    if (!resolvedWorkspaceId || resolvedLicenseType !== "commercial") return;
    try {
      setReleasingWorkspace(true);

      // Flush the latest in-memory session edits to server before releasing lock.
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          window.dispatchEvent(
            new CustomEvent("ymga:flush-workspace-state", {
              detail: { resolve, reject },
            }),
          );
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);

      await releaseWorkspace(resolvedWorkspaceId, clientSessionId);
      setResolvedWorkspaceId(null);
      setLockConflict({
        message: "Workspace released for this session. Close this tab or return to the main site so another device can access it.",
      });
    } catch {
      setLockConflict({
        message: "Could not release workspace right now. Please try again.",
      });
    } finally {
      setReleasingWorkspace(false);
    }
  };

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
          </div>
          <button
            type="button"
            className="app-mobile-menu-btn"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
          <div
            className={`app-return-controls${mobileMenuOpen ? " open" : ""}`}
            ref={mobileMenuRef}
          >
            <div className="app-return-left-group">
              <div className="app-file-actions" aria-label="Configuration">
                <button
                  type="button"
                  className="app-file-action"
                  onClick={() => {
                    triggerConfigAction("export");
                    setMobileMenuOpen(false);
                  }}
                  disabled={checking}
                >
                  Export
                </button>
                <button
                  type="button"
                  className="app-file-action"
                  onClick={() => {
                    triggerConfigAction("import");
                    setMobileMenuOpen(false);
                  }}
                  disabled={checking}
                >
                  Import
                </button>
              </div>
              {sessionTiming ? (
                <div className={`app-session-inline${sessionToneClass}`} role="status" aria-live="polite" ref={sessionInfoRef}>
                  <span className="app-session-meta">{formatSessionCountdown(sessionTiming.remainingMs)}</span>
                  <button
                    type="button"
                    className="app-session-toggle"
                    onClick={() => setSessionInfoCollapsed((v) => !v)}
                    aria-label={sessionInfoCollapsed ? "Expand session information" : "Collapse session information"}
                  >
                    {sessionInfoCollapsed ? "Expand" : "Collapse"}
                  </button>
                  {!sessionInfoCollapsed ? (
                    <div className="app-session-dropdown" role="dialog" aria-label="Session information">
                      <div className="app-session-dropdown-row">
                        <span className="app-session-label">Session</span>
                      </div>
                      <div className="app-session-dropdown-row">
                        <span className="app-session-dropdown-key">Remaining</span>
                        <span>{formatSessionCountdown(sessionTiming.remainingMs)}</span>
                      </div>
                      {showSessionExpiry ? (
                        <div className="app-session-dropdown-row">
                          <span className="app-session-dropdown-key">Expires at</span>
                          <span>{formatSessionExpiryTime(sessionTiming.expiresAtMs)}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {resolvedLicenseType === "commercial" && resolvedWorkspaceId ? (
                <button
                  type="button"
                  className="app-file-action"
                  onClick={handleReleaseWorkspace}
                  disabled={checking || releasingWorkspace}
                >
                  {releasingWorkspace ? "Releasing..." : "Release Workspace"}
                </button>
              ) : null}
            </div>
            <div className="app-return-actions">
              <ToggleSwitch
                className="app-theme-toggle-switch"
                checked={isDark}
                onChange={(next) => setAppTheme(next ? "dark" : "light")}
                label="Dark mode"
              />
              <a
                className="app-return-link"
                href={WEBSITE_URL}
                onClick={() => setMobileMenuOpen(false)}
              >
                Back to main website
              </a>
            </div>
          </div>
        </div>
      </div>
      {checking ? (
        <div className="app-loading">Validating license…</div>
      ) : lockConflict ? (
        <div className="app-loading" role="alert">
          <div>{lockConflict.message}</div>
          {lockConflict.lockExpiresAt ? (
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Lock expires at {new Date(lockConflict.lockExpiresAt * 1000).toLocaleTimeString()}.
            </div>
          ) : null}
        </div>
      ) : (
        <App
          embedded
          initialWorkspaceId={resolvedWorkspaceId}
          initialLicenseType={resolvedLicenseType}
          clientSessionId={clientSessionId}
        />
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
