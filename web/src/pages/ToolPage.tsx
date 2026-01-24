import { useEffect, useMemo, useState } from "react";
import { TipsBox } from "../components/TipsBox";
import { withBase } from "../baseUrl";
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
  const trimmed = useMemo(() => licenseKey.trim(), [licenseKey]);

  async function checkKey(key: string) {
    setBusy(true);
    setError("");
    try {
      const res = await validateLicenseKey(key);
      if (res.valid) {
        setStoredLicenseKey(key);
        setValid(true);
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
          <h1 className="ss-cover-title">Custom Flow Automator</h1>
          <p className="ss-cover-subtitle">
            Parse a yearbook template, ingest spreadsheets and photos, review assignments, then generate a
            print-ready composite.
          </p>

          <div className="tool-tips-center">
            <TipsBox
              tips={[
                "If template parsing fails, try raising the color tolerance or lowering min-area in Custom options.",
                "Clean template must be identical in size and layout to the annotated template for accurate slot detection.",
                "Non-matching portrait filenames are skipped—check warnings to see which files weren't used.",
                "Missing quotes are allowed; configure a default quote as a fallback for students without entries.",
                "Reorder students by dragging cards in the preview step before rendering to customize your spreads.",
                "Use the 'Prioritize names' toggle to match portraits by student names before falling back to numeric filenames.",
                "Save a config file occasionally so you can restore work after a refresh or long session.",
                "Config files preserve your template, mappings, quotes, and styling—upload them to skip redundant steps.",
                "Reset all to start over; this deletes your workspace and clears all unsaved progress.",
                "Crop baby photos to match the template cutout exactly—use the preview editor to adjust zoom and position.",
                "Enable background removal to make baby photo edges transparent, then set a fill color for the cutout.",
                "Center baby photos on faces automatically with the 'Center on face' toggle during rendering.",
                "Baby photo fill color can be sampled directly from your clean template using the color picker.",
                "Custom fonts are uploaded per session; upload TTF/OTF files or use system/default fonts.",
                "Placement mode 'left then right' fills columns; 'alphabetical' sorts by last name across spreads.",
                "Template parsing fails? Check that colored boxes are solid, contiguous, and at least 400px² in area.",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="tool-launch">
        <div className="tool-launch-card">
          <div className="stack" style={{ gap: 6 }}>
            <h2>License required</h2>
            <p className="muted">Enter a license key to unlock the Tool, then launch it in a new tab.</p>
          </div>

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
            />
          </label>

          {error && <div className="callout danger">{error}</div>}
          {valid && <div className="callout success">License approved. You can launch the tool.</div>}

          <div className="actions tool-launch-actions">
            <button type="button" onClick={() => void checkKey(trimmed)} disabled={busy || !trimmed}>
              {busy ? "Validating..." : "Validate license"}
            </button>
            <button type="button" onClick={() => void handleFreeKey()} disabled={busy}>
              Get free personal (non-commercial) key
            </button>
          </div>

          <button
            type="button"
            className="primary tool-launch-btn"
            disabled={!valid}
            onClick={() => {
              if (typeof window === "undefined") return;
              window.open(withBase("app"), "_blank", "noopener,noreferrer");
            }}
          >
            Launch tool
          </button>

          <div className="muted small">
            Free personal keys are intended for personal, non-commercial use and are limited to 5 uses per month.
            Commercial usage requires a paid key.
          </div>
        </div>
      </section>
    </main>
  );
}
