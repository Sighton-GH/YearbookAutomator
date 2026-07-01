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
import { ThemeToggle } from "../components/ThemeToggle";
import { GuidedTour, type TourStep } from "../components/GuidedTour";
import { HelpPanel } from "../components/HelpPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HelpCircle, KeyRound } from "lucide-react";

const TOUR_SEEN_KEY = "ymga-tour-seen-v1";

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome 👋",
    body: "This tool turns a template, a roster, and photos into print-ready yearbook spreads. Here's a 30-second tour.",
  },
  {
    target: ".roadmap-rail",
    placement: "right",
    title: "Your roadmap",
    body: "Five simple steps, left to right: Template → Roster & Photos → People → Style → Generate. Each step unlocks the next.",
  },
  {
    target: ".import-card",
    placement: "left",
    title: "Upload as you go",
    body: "Each step asks only for what it needs. Drag a file in or click Upload — we'll process it automatically.",
  },
  {
    target: ".canvas-footer .footer-right button.primary",
    placement: "top",
    title: "Move forward",
    body: "When a step is ready, the Continue button lights up. You can always jump back via the roadmap.",
  },
  {
    target: "[data-tour=\"help\"]",
    placement: "bottom",
    title: "Help is always here",
    body: "Stuck? Open Help to replay this tour, load a sample project, or read the docs. Look for ? icons for tips on any setting.",
  },
  {
    title: "You're all set",
    body: "Start by uploading your template — or click Help → Load a sample project to see a finished example first.",
  },
];

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
  const [showChangeLicenseConfirm, setShowChangeLicenseConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionInfoCollapsed, setSessionInfoCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ymga-session-info-collapsed") === "1";
  });
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem("ymga-app-theme") === "light" ? "light" : "dark";
  });
  const isDark = appTheme === "dark";
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionInfoRef = useRef<HTMLDivElement | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

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
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymga-session-info-collapsed", sessionInfoCollapsed ? "1" : "0");
  }, [sessionInfoCollapsed]);

  // First-run: auto-launch the guided tour once the tool is unlocked (give App a beat to mount the rail).
  useEffect(() => {
    if (checking || !valid) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TOUR_SEEN_KEY) === "1") return;
    const t = window.setTimeout(() => setTourOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [checking, valid]);

  const closeTour = () => {
    setTourOpen(false);
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  // App owns the upload pipeline; it signals when a sample finishes (or fails) loading.
  useEffect(() => {
    const onDone = () => setSampleBusy(false);
    window.addEventListener("ymga:load-sample-done", onDone);
    return () => window.removeEventListener("ymga:load-sample-done", onDone);
  }, []);

  const handleLoadSample = () => {
    setSampleBusy(true);
    setHelpOpen(false);
    window.dispatchEvent(new Event("ymga:load-sample"));
  };

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

  // Flush the latest in-memory session edits to server before releasing lock.
  const flushAndReleaseWorkspace = async (workspaceId: string) => {
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

    await releaseWorkspace(workspaceId, clientSessionId);
  };

  const handleReleaseWorkspace = async () => {
    if (!resolvedWorkspaceId || resolvedLicenseType !== "commercial") return;
    try {
      setReleasingWorkspace(true);
      await flushAndReleaseWorkspace(resolvedWorkspaceId);
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

  // Lets the user swap in a different license key: best-effort release any held
  // commercial workspace lock, then clear the stored key to return to the license-entry screen.
  const handleChangeLicenseKey = async () => {
    setMobileMenuOpen(false);
    if (resolvedWorkspaceId && resolvedLicenseType === "commercial") {
      try {
        await flushAndReleaseWorkspace(resolvedWorkspaceId);
      } catch {
        // Proceed to the license screen even if the release call failed.
      }
    }

    setStoredLicenseKey(null);
    setValid(false);
    setResolvedWorkspaceId(null);
    setResolvedLicenseType(null);
    setLockConflict(null);
    setLicenseKeyInput("");
    setLicenseError("");
  };

  return (
    <div className="app-shell">
      <ConfirmDialog
        open={showChangeLicenseConfirm}
        title="Change license key?"
        message="You'll return to the license-entry screen and need to re-enter a key to use the tool again. Your current session stays saved and isn't deleted."
        confirmLabel="Change key"
        cancelLabel="Cancel"
        onCancel={() => setShowChangeLicenseConfirm(false)}
        onConfirm={() => {
          setShowChangeLicenseConfirm(false);
          void handleChangeLicenseKey();
        }}
      />
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
              <button
                type="button"
                className="app-icon-btn"
                data-tour="help"
                onClick={() => {
                  setHelpOpen(true);
                  setMobileMenuOpen(false);
                }}
                aria-label="Open help"
              >
                <HelpCircle size={16} />
                <span>Help</span>
              </button>
              <button
                type="button"
                className="app-icon-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowChangeLicenseConfirm(true);
                }}
                aria-label="Change license key"
              >
                <KeyRound size={16} />
                <span>Change License Key</span>
              </button>
              <ThemeToggle isDark={isDark} onChange={(next) => setAppTheme(next ? "dark" : "light")} />
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
        <div className="app-footer-inner">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <img
              src={withBase("assets/Sighton_Logo.png")}
              alt="Sighton logo"
              style={{ width: 20, height: 20, objectFit: "contain" }}
            />
            <span>Sighton Yearbook Tools</span>
          </div>
          <div className="app-footer-credit">
            Created by{" "}
            <a href="https://sighton.ca" target="_blank" rel="noopener noreferrer">
              Sighton Media
            </a>
          </div>
        </div>
      </footer>

      <HelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onReplayTour={() => {
          setHelpOpen(false);
          setTourOpen(true);
        }}
        onLoadSample={handleLoadSample}
        sampleBusy={sampleBusy}
        websiteUrl={WEBSITE_URL}
      />
      <GuidedTour steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />
    </div>
  );
}
