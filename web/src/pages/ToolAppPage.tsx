import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import App from "../App";
import { withBase } from "../baseUrl";
import { getStoredLicenseKey, validateLicenseKey } from "../licensing";
import { ToggleSwitch } from "../components/ToggleSwitch";

export function ToolAppPage() {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
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
