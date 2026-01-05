import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { parseTemplate, type RawParseDebug, type TemplateSlots } from "../api";
import { formatEtaSeconds } from "../utils/ui";

export function TemplateParsing({
  workspaceId,
  onParsed,
  skipQuotes,
  onSkipQuotes,
  skipBabyPhotos,
  onSkipBabyPhotos,
  setStatus,
  setLoading,
  setProgress,
  loading,
  onPreviewChange,
  annotated,
  clean,
  annotatedPreview,
  cleanPreview,
  onAnnotatedChange,
  onCleanChange,
  peoplePerSpread,
  setPeoplePerSpread,
  mugshotColor,
  setMugshotColor,
  babyColor,
  setBabyColor,
  nameColor,
  setNameColor,
  quoteColor,
  setQuoteColor,
  minArea,
  setMinArea,
  onRawDebug,
}: {
  workspaceId: string | null;
  onParsed: (resp: { template_id: string; width: number; height: number; slots: TemplateSlots[] }) => void;
  skipQuotes: boolean;
  onSkipQuotes: (v: boolean) => void;
  skipBabyPhotos: boolean;
  onSkipBabyPhotos: (v: boolean) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: Dispatch<SetStateAction<number>>;
  loading: boolean;
  onPreviewChange?: (urls: { annotated?: string | null; clean?: string | null }) => void;
  annotated: File | null;
  clean: File | null;
  annotatedPreview: string | null;
  cleanPreview: string | null;
  onAnnotatedChange: (file: File | null) => void;
  onCleanChange: (file: File | null) => void;
  peoplePerSpread: number;
  setPeoplePerSpread: (n: number) => void;
  mugshotColor: string;
  setMugshotColor: (v: string) => void;
  babyColor: string;
  setBabyColor: (v: string) => void;
  nameColor: string;
  setNameColor: (v: string) => void;
  quoteColor: string;
  setQuoteColor: (v: string) => void;
  minArea: number;
  setMinArea: (n: number) => void;
  onRawDebug?: (debug: RawParseDebug | null) => void;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const annotatedRef = useRef<HTMLDivElement | null>(null);
  const cleanRef = useRef<HTMLDivElement | null>(null);
  const parseProcessingEstimateSecondsRef = useRef(4);

  const normalizeHexColor = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const hex = withHash.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const expanded = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
      return `#${expanded.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    return null;
  };

  const thumbSizeForAspect = (maxSize: number, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
    if (aspect >= 1) {
      return { width: maxSize, height: Math.max(1, Math.round(maxSize / aspect)) };
    }
    return { width: Math.max(1, Math.round(maxSize * aspect)), height: maxSize };
  };

  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange({ annotated: annotatedPreview, clean: cleanPreview });
    }
  }, [cleanPreview, annotatedPreview, onPreviewChange]);

  const scrollTo = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleParse = async () => {
    const hasUpload = Boolean(annotated || clean);
    const missingAnnotated = !workspaceId && !annotated;
    const missingClean = !workspaceId && !clean;
    if (missingAnnotated || missingClean) {
      setShowMissing(true);
      const missing: string[] = [];
      if (missingAnnotated) missing.push("Annotated template (.png)");
      if (missingClean) missing.push("Clean template (.png)");
      setStatus(`Missing required file(s): ${missing.join(", ")}`);
      scrollTo((missingAnnotated ? annotatedRef.current : cleanRef.current) ?? null);
      return;
    }
    setProgress(0);
    setLoading(true);
    setStatus(hasUpload ? "Uploading templates..." : "Parsing template...");

    const opStartMs = performance.now();
    let uploadFinishedMs: number | null = null;
    let processingInterval: number | null = null;
    const clearProcessingInterval = () => {
      if (processingInterval !== null) {
        window.clearInterval(processingInterval);
        processingInterval = null;
      }
    };
    const startProcessingTicker = () => {
      if (processingInterval !== null) return;
      const startMs = uploadFinishedMs ?? performance.now();
      processingInterval = window.setInterval(() => {
        const elapsed = Math.max(0, (performance.now() - startMs) / 1000);
        const est = Math.max(1, parseProcessingEstimateSecondsRef.current);
        const remaining = Math.max(0, est - elapsed);
        setProgress((prev) => {
          const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
          return Math.max(prev, Math.min(99, pct));
        });
        setStatus(`Parsing template… ETA ${formatEtaSeconds(remaining)}`);
      }, 250);
    };

    try {
      if (hasUpload) {
        // Ensure the progress bar shows even if the browser can't compute upload totals.
        setProgress(1);
      } else {
        // Parsing-only mode (workspace re-parse): no upload bytes, so start directly at the
        // parsing stage.
        uploadFinishedMs = opStartMs;
        setProgress(90);
        startProcessingTicker();
      }

      const resp = await parseTemplate(annotated, clean, {
        workspaceId: workspaceId || undefined,
        mugshotColor: mugshotColor || undefined,
        babyColor: babyColor || undefined,
        nameColor: nameColor || undefined,
        quoteColor: quoteColor || undefined,
        disableBabyPhotos: skipBabyPhotos,
        disableQuotes: skipQuotes,
        minArea,
        onProgress: (pct) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
          const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);

          setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));

          if (clamped >= 100 && uploadFinishedMs === null) {
            uploadFinishedMs = performance.now();
            startProcessingTicker();
            return;
          }

          let etaPart = "";
          if (clamped >= 2 && elapsed >= 0.25) {
            const etaSeconds = (elapsed * (100 - clamped)) / clamped;
            if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
          }
          setStatus(`Uploading templates… ${clamped}%${etaPart}`);
        },
      });

      clearProcessingInterval();
      onParsed(resp);
      if (onRawDebug) onRawDebug(resp.raw_debug ?? null);
      setStatus("Template parsed successfully");
      setProgress(100);

      const processingStartMs = uploadFinishedMs ?? opStartMs;
      const processingSeconds = Math.max(0, (performance.now() - processingStartMs) / 1000);
      if (processingSeconds >= 0.25) {
        parseProcessingEstimateSecondsRef.current =
          0.7 * parseProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
      }
    } catch (err: any) {
      clearProcessingInterval();
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || "Template parsing failed";
      setStatus(`Template parsing failed.\nserver message:\n${detail}`);
    } finally {
      clearProcessingInterval();
      setLoading(false);
    }
  };

  const missingAnnotatedUi = showMissing && !workspaceId && !annotated;
  const missingCleanUi = showMissing && !workspaceId && !clean;

  return (
    <div className="stack">
      <p className="muted">
        Upload the annotated template (coloured blocks for portrait/baby/name/quote) and the clean template to be modified.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
        <div ref={annotatedRef}>
          <div className="upload-title">Annotated template (.png)</div>
          {missingAnnotatedUi && (
            <div className="upload-error">
              <span aria-hidden="true">❗</span> Please upload a file
            </div>
          )}
          <UploadDropLabel
            accept="image/png"
            disabled={loading}
            className={missingAnnotatedUi ? "invalid" : undefined}
            onFile={(file) => {
              setShowMissing(false);
              onAnnotatedChange(file);
            }}
          >
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setShowMissing(false);
                onAnnotatedChange(file);
              }}
            />
            {annotatedPreview && <img src={annotatedPreview} alt="Annotated preview" className="template-thumb" />}
          </UploadDropLabel>
        </div>

        <div ref={cleanRef}>
          <div className="upload-title">Clean template (.png)</div>
          {missingCleanUi && (
            <div className="upload-error">
              <span aria-hidden="true">❗</span> Please upload a file
            </div>
          )}
          <UploadDropLabel
            accept="image/png"
            disabled={loading}
            className={missingCleanUi ? "invalid" : undefined}
            onFile={(file) => {
              setShowMissing(false);
              onCleanChange(file);
            }}
          >
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setShowMissing(false);
                onCleanChange(file);
              }}
            />
            {cleanPreview && <img src={cleanPreview} alt="Clean preview" className="template-thumb" />}
          </UploadDropLabel>
        </div>
      </div>
      <label className="field">
        <span>People per spread (max slots to keep)</span>
        <input
          type="number"
          min={1}
          max={200}
          value={peoplePerSpread}
          onChange={(e) => setPeoplePerSpread(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="muted small">Slots beyond this count will be dropped during grouping.</span>
      </label>

      <details>
        <summary>
          <strong>Custom options</strong>
        </summary>
        <div className="stack" style={{ gap: 12, marginTop: 8 }}>
          <p className="muted small">
            Optional tweaks for templates that don’t parse cleanly with defaults. Use these to hide steps you don’t need,
            adjust detection sensitivity, or override the slot colours. Leave colour overrides blank to use the automatic
            defaults.
          </p>
          <ToggleSwitch
            checked={skipQuotes}
            onChange={onSkipQuotes}
            label="Disable quotes (skip detection + step)"
            description="The template parser will not look for quote boxes, the Quotes step is skipped, and quotes are not rendered."
          />
          <ToggleSwitch
            checked={skipBabyPhotos}
            onChange={onSkipBabyPhotos}
            label="Disable baby photos (skip detection + step)"
            description="The template parser will not look for baby cutouts, the Baby Photos step is skipped, and baby photos are not rendered."
          />

          <div className="color-overrides">
            <div className="field color-override">
              <label htmlFor="mugshotColorText">Portrait colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Portrait colour override"
                  value={mugshotColor || "#22c55e"}
                  onChange={(e) => setMugshotColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="mugshotColorText"
                  type="text"
                  placeholder="#22c55e"
                  value={mugshotColor}
                  onChange={(e) => setMugshotColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setMugshotColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="babyColorText">Baby colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Baby colour override"
                  value={babyColor || "#3b82f6"}
                  onChange={(e) => setBabyColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="babyColorText"
                  type="text"
                  placeholder="#3b82f6"
                  value={babyColor}
                  onChange={(e) => setBabyColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setBabyColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="nameColorText">Name colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Name colour override"
                  value={nameColor || "#ff751f"}
                  onChange={(e) => setNameColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="nameColorText"
                  type="text"
                  placeholder="#ff751f"
                  value={nameColor}
                  onChange={(e) => setNameColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setNameColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="quoteColorText">Quote colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Quote colour override"
                  value={quoteColor || "#ff3131"}
                  onChange={(e) => setQuoteColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="quoteColorText"
                  type="text"
                  placeholder="#ff3131"
                  value={quoteColor}
                  onChange={(e) => setQuoteColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setQuoteColor(normalized);
                  }}
                />
              </div>
            </div>
          </div>
          <div className="inline">
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMugshotColor("");
                setBabyColor("");
                setNameColor("");
                setQuoteColor("");
              }}
            >
              Reset colors to default
            </button>
          </div>
          <label className="field">
            <span title="Ignores boxes smaller than this; try 800-1500 for high-res templates">Minimum detected area (pixels²)</span>
            <input
              type="number"
              min={400}
              value={minArea}
              onChange={(e) => setMinArea(Math.max(400, Number(e.target.value) || 400))}
            />
            <span className="muted small">Higher numbers ignore tiny false positives; defaults to 800.</span>
          </label>
        </div>
      </details>
      <button className="primary" onClick={handleParse}>
        Parse template
      </button>
    </div>
  );
}
