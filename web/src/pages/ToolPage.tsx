import { useEffect, useMemo, useState } from "react";
import App from "../App";
import { TipsBox } from "../components/TipsBox";
import {
  getStoredLicenseKey,
  requestFreePersonalKey,
  setStoredLicenseKey,
  validateLicenseKey
} from "../licensing";

export function ToolPage() {
  const [licenseKey, setLicenseKey] = useState<string>("");
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [show, setShow] = useState(true);

  const trimmed = useMemo(() => licenseKey.trim(), [licenseKey]);

  async function checkKey(key: string) {
    setBusy(true);
    setError("");
    try {
      const res = await validateLicenseKey(key);
      if (res.valid) {
        setStoredLicenseKey(key);
        setValid(true);
        setShow(false);
        return;
      }
      setValid(false);
      setError(res.reason ? `Invalid license key (${res.reason}).` : "Invalid license key.");
    } catch (e) {
      setValid(false);
      setError(e instanceof Error ? e.message : "Could not validate license key");
    } finally {
      setBusy(false);
    }
  }

  async function handleFreeKey() {
    setBusy(true);
    setError("");
    try {
      const key = await requestFreePersonalKey();
      setLicenseKey(key);
      await checkKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create free key");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const existing = getStoredLicenseKey();
    if (existing) {
      setLicenseKey(existing);
      void checkKey(existing);
    }
  }, []);

  return (
    <main>
      <section className="ss-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Custom Yearbook Spread Automator</h1>
          <p className="ss-cover-subtitle">
            Parse a yearbook template, ingest spreadsheets and photos, review assignments, then generate a
            print-ready composite.
          </p>

          <TipsBox
            tips={[
              "Use crisp solid-color rectangles on the annotated template (name + quote boxes are required).",
              "Save a config file occasionally so you can restore work after a refresh or long session.",
              "If portraits are numbered, filenames like 001.jpg map to spreadsheet row 1.",
              "If template parsing fails, try raising the color tolerance or lowering min-area in Custom options.",
              "For best results, run locally on localhost or HTTPS to avoid unencrypted uploads.",
            ]}
          />
        </div>
      </section>

      {show && !valid && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enter license key">
          <div className="modal">
            <div className="modal-header">
              <div className="stack" style={{ gap: 2 }}>
                <strong>License required</strong>
                <div className="muted small">Enter a license key to use the Tool.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShow(false);
                }}
                disabled={busy}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>License key</span>
                <input
                  value={licenseKey}
                  onChange={(e) => {
                    setLicenseKey(e.target.value);
                    setError("");
                  }}
                  placeholder="YMGA1-..."
                  disabled={busy}
                  autoFocus
                />
              </label>

              {error && <div className="callout danger">{error}</div>}

              <div className="actions" style={{ justifyContent: "space-between" }}>
                <button type="button" onClick={() => void checkKey(trimmed)} disabled={busy || !trimmed}>
                  Validate and continue
                </button>
                <button type="button" onClick={() => void handleFreeKey()} disabled={busy}>
                  Get free personal (non-commercial) key
                </button>
              </div>

              <div className="muted small">
                Free personal keys are intended for personal, non-commercial use and are limited to 5 uses per month.
                Commercial usage requires a paid key.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Program UI below (embedded: no duplicate title/description; single steps row) */}
      {valid ? (
        <App embedded />
      ) : (
        <section className="ss-cover">
          <div className="ss-cover-inner">
            <p className="ss-cover-subtitle">Enter a license key to unlock the Tool.</p>
            <div className="ss-hero-actions">
              <button
                type="button"
                className="ss-cta"
                onClick={() => setShow(true)}
                disabled={busy}
              >
                Enter license key
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
