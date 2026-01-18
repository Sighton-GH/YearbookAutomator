import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import App from "../App";
import { withBase } from "../baseUrl";
import { getStoredLicenseKey, validateLicenseKey } from "../licensing";

export function ToolAppPage() {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

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

  if (!checking && !valid) return <Navigate to="/tool" replace />;

  return (
    <div className="app-shell">
      <div className="app-return-bar">
        <div className="app-return-inner">
          <span className="app-title">Custom Yearbook Spread Automator</span>
          <a className="app-return-link" href={withBase("/")}>Back to main website</a>
        </div>
      </div>
      {checking ? (
        <div className="app-loading">Validating license…</div>
      ) : (
        <App embedded />
      )}
      <footer className="app-footer">
        <div className="app-footer-inner">Sighton Innovations</div>
      </footer>
    </div>
  );
}
