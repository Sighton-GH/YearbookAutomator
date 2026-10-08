import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { describeApiError } from "../configFile";
import { generationDownloadFile, generationDownloadAllUrl, generationDownloadSpreadsheetUrl, generationDownloadUrl, type PersonRecord } from "../api";
import { printSizeDescription } from "../utils/printSize";
import { InfoPopover } from "../components/InfoPopover";
import type { PlacementMode } from "../types";

export function FinalizeStep({
  defaultQuote,
  quoteImportWarnings,
  renderConfirmed,
  onRenderConfirmed,
  warnings = [],
  people,
  peoplePerSpread,
  skipQuotes,
  skipBabyPhotos,
  templateSize,
  outputSize,
  onOutputSize,
  outputFormat,
  onOutputFormat,
  placementMode,
  onPlacementMode,
  forceAlphabetical,
  onForceAlphabetical,
  alphabeticalSortOptionEnabled,
  pdfOutputEnabled,
  tiffOutputEnabled,
  loading,
  canContinue,
  handleRenderPreview,
  handleRenderAll,
  onCancelRender,
  workspaceId,
  previewPath,
  previewNonce,
  outputPath,
  outputPaths,
  outputNonce,
  usageInfo,
}: {
  defaultQuote: string;
  quoteImportWarnings: string[];
  renderConfirmed: boolean;
  onRenderConfirmed: (value: boolean) => void;
  warnings?: string[];
  people: PersonRecord[];
  peoplePerSpread: number;
  skipQuotes: boolean;
  skipBabyPhotos: boolean;
  templateSize: { width: number; height: number } | null;
  outputSize: { width: number; height: number } | null;
  onOutputSize: (v: { width: number; height: number } | null) => void;
  outputFormat: "png" | "pdf" | "tiff";
  onOutputFormat: (v: "png" | "pdf" | "tiff") => void;
  placementMode: PlacementMode;
  onPlacementMode: (mode: PlacementMode) => void;
  forceAlphabetical: boolean;
  onForceAlphabetical: (next: boolean) => void;
  alphabeticalSortOptionEnabled: boolean;
  pdfOutputEnabled: boolean;
  tiffOutputEnabled: boolean;
  loading: boolean;
  canContinue: boolean;
  handleRenderPreview: () => void;
  handleRenderAll: () => void;
  onCancelRender?: () => void;
  workspaceId: string | null;
  previewPath: string | null;
  previewNonce: number;
  outputPath: string | null;
  outputPaths: string[];
  outputNonce: number;
  usageInfo?: { remaining: number; limit: number; period: "month" | "lifetime" } | null;
}) {
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const download = async (url: string, filename: string) => {
    setDownloading(true);
    setDownloadStatus("Preparing download...");
    try {
      await generationDownloadFile(url, filename);
      setDownloadStatus("Download started.");
    } catch (error) {
      setDownloadStatus(describeApiError(error, "Could not download this file. Please try again."));
    } finally {
      setDownloading(false);
    }
  };
  const [confirmRender, setConfirmRender] = useState(false);
  const defaultQuotePeople = skipQuotes ? [] : people.filter(p => !p.quote_blank && !p.quote?.trim());
  const missingPortraits = people.filter(p => !p.mugshot_filename);
  const missingBabies = skipBabyPhotos ? [] : people.filter(p => !p.baby_photo_filename);
  const groups = [
    {label: `Default quote: "${defaultQuote}"`, people: defaultQuotePeople},
    {label: "No portrait: default portrait or blank will print", people: missingPortraits},
    {label: "No baby photo: default baby photo or blank will print", people: missingBabies},
  ];
  const requestRender = () => {
    if (!renderConfirmed && (groups.some(g => g.people.length) || quoteImportWarnings.length)) setConfirmRender(true);
    else handleRenderAll();
  };
  const previewIsPng = outputFormat === "png";
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const hasTemplateSize = Boolean(templateSize && templateSize.width > 0 && templateSize.height > 0);
  const exportQualityMode: "original" | "custom" = hasTemplateSize && outputSize ? "custom" : "original";

  const setCustomWidth = (rawWidth: number) => {
    if (!templateSize) return;
    const w = clamp(Math.round(rawWidth), 1, templateSize.width);
    const h = clamp(Math.round((w * templateSize.height) / templateSize.width), 1, templateSize.height);
    onOutputSize({ width: w, height: h });
  };
  const setCustomHeight = (rawHeight: number) => {
    if (!templateSize) return;
    const h = clamp(Math.round(rawHeight), 1, templateSize.height);
    const w = clamp(Math.round((h * templateSize.width) / templateSize.height), 1, templateSize.width);
    onOutputSize({ width: w, height: h });
  };

  const rawFiles = (outputPaths && outputPaths.length ? outputPaths : outputPath ? [outputPath] : [])
    .map((p) => p.split(/[\\/]/).pop() || p)
    .filter(Boolean);
  const parseSpreadNumber = (fname: string) => {
    const m = fname.match(/output_(\d+)\.(png|pdf|tif|tiff)$/i);
    return m ? Number(m[1]) : null;
  };
  const files = [...rawFiles].sort((a, b) => {
    const an = parseSpreadNumber(a);
    const bn = parseSpreadNumber(b);
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1;
    if (bn != null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="callout"><strong>Before you render</strong>
        {groups.map(g => <details key={g.label}><summary>{g.label} ({g.people.length})</summary><ul>{g.people.map(p => <li key={p.index}>{p.first_name} {p.last_name}</li>)}</ul></details>)}
        {quoteImportWarnings.length > 0 && <details><summary>Quotes skipped during import ({quoteImportWarnings.length})</summary><ul>{quoteImportWarnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul></details>}
      </div>
      <ConfirmDialog open={confirmRender} title="Render with missing content?" confirmLabel="Render anyway" cancelLabel="Go back" onCancel={() => setConfirmRender(false)} onConfirm={() => {setConfirmRender(false);handleRenderAll();}} message={<div>{groups.filter(g => g.people.length).map(g => <p key={g.label}>{g.people.length} students: {g.label}. {g.people.map(p => `${p.first_name} ${p.last_name}`).join(", ")}</p>)}<label><input type="checkbox" checked={renderConfirmed} onChange={e => onRenderConfirmed(e.target.checked)} />Don't ask again for this project</label></div>} />
      {warnings.length > 0 && <details className="callout"><summary>Render warnings ({warnings.length})</summary><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
      {downloadStatus && <div role="status" aria-live="polite" className="callout">{downloadStatus}</div>}
      <div className="callout">
        <div className="stack" style={{ gap: 6 }}>
          <strong>Stats</strong>
          <div className="inline" style={{ gap: 14, flexWrap: "wrap" }}>
            <div className="muted small">Resolution: <strong>{templateSize ? `${templateSize.width} × ${templateSize.height} px` : "—"}</strong></div>
            <div className="muted small">
              Estimated spreads: <strong>{peoplePerSpread > 0 ? Math.max(1, Math.ceil(people.length / peoplePerSpread)) : "—"}</strong>
              <span className="muted"> (at {peoplePerSpread} students/spread)</span>
            </div>
            <div className="muted small">Total students: <strong>{people.length}</strong></div>
            <div className="muted small">Missing portrait: <strong>{people.filter((p) => !p.mugshot_filename).length}</strong></div>
            {skipBabyPhotos ? (
              <div className="muted small">Baby photos disabled for this batch</div>
            ) : (
              <div className="muted small">Missing baby photo: <strong>{people.filter((p) => !p.baby_photo_filename).length}</strong></div>
            )}
            {skipQuotes ? (
              <div className="muted small">Quotes disabled for this batch</div>
            ) : (
              <div className="muted small">Missing quote: <strong>{people.filter((p) => !p.quote || !p.quote.trim()).length}</strong></div>
            )}
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="callout">
          <div className="stack" style={{ gap: 8 }}>
            <div className="inline" style={{ alignItems: "center", gap: 6 }}>
              <strong>Placement</strong>
              <InfoPopover content="Choose how students are filled into a two-page spread." ariaLabel="Placement description" />
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
                <input type="radio" name="placementMode" value="simultaneous" checked={placementMode === "simultaneous"} onChange={() => onPlacementMode("simultaneous")} disabled={loading} />
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <div>Fill both pages simultaneously</div>
                  <InfoPopover content="Uses the template's reading order across the full spread." ariaLabel="Simultaneous placement description" />
                </div>
              </label>
              <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
                <input type="radio" name="placementMode" value="left_then_right" checked={placementMode === "left_then_right"} onChange={() => onPlacementMode("left_then_right")} disabled={loading} />
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <div>Fill left page, then right page</div>
                  <InfoPopover content="Fills the left page in reading order, then the right page in reading order." ariaLabel="Left then right placement description" />
                </div>
              </label>
              {alphabeticalSortOptionEnabled && (
                <label className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={forceAlphabetical} onChange={(e) => onForceAlphabetical(e.target.checked)} disabled={loading} />
                  <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                    <div>Force alphabetical (by last name)</div>
                    <InfoPopover content="Sorts the generation order by last name before filling slots." ariaLabel="Alphabetical placement description" />
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="callout">
          <div className="stack" style={{ gap: 8 }}>
            <div className="inline" style={{ alignItems: "center", gap: 6 }}>
              <strong>Export format</strong>
              <InfoPopover content="Affects preview and Render all. Default: PNG. TIFF is a single flattened composite like PNG." ariaLabel="Export format description" />
            </div>
            <select value={outputFormat} onChange={(e) => onOutputFormat(e.target.value as "png" | "pdf" | "tiff")} disabled={loading}>
              <option value="png">PNG (default)</option>
              {pdfOutputEnabled && <option value="pdf">PDF</option>}
              {tiffOutputEnabled && <option value="tiff">TIFF</option>}
            </select>

            <div className="inline" style={{ alignItems: "center", gap: 6, marginTop: 6 }}>
              <strong>Export quality</strong>
              <InfoPopover content="Choose an output resolution. Max is the template's original resolution. Aspect ratio is locked to match the template." ariaLabel="Export quality description" />
            </div>
            <select
              value={exportQualityMode}
              onChange={(e) => {
                const mode = e.target.value as "original" | "custom";
                if (mode === "original") onOutputSize(null);
                else if (templateSize) onOutputSize({ width: templateSize.width, height: templateSize.height });
              }}
              disabled={loading || !hasTemplateSize}
            >
              <option value="original">Original{templateSize ? ` (${templateSize.width} × ${templateSize.height})` : ""}</option>
              <option value="custom">Custom resolution…</option>
            </select>

            {templateSize && (
              <div className="muted small">{printSizeDescription(templateSize, outputSize)}</div>
            )}

            {hasTemplateSize && exportQualityMode === "custom" && outputSize && (
              <div className="grid two" style={{ gap: 10 }}>
                <label className="stack" style={{ gap: 6 }}>
                  <span className="muted small">Width (px)</span>
                  <input type="number" min={1} max={templateSize!.width} value={outputSize.width} onChange={(e) => setCustomWidth(Number(e.target.value))} disabled={loading} />
                </label>
                <label className="stack" style={{ gap: 6 }}>
                  <span className="muted small">Height (px)</span>
                  <input type="number" min={1} max={templateSize!.height} value={outputSize.height} onChange={(e) => setCustomHeight(Number(e.target.value))} disabled={loading} />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="callout">
        <div className="stack" style={{ gap: 10 }}>
          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <strong>Preview render (1 page)</strong>
            <InfoPopover content="Uses the first page worth of people/slots as a quick test." ariaLabel="Preview render description" />
          </div>
          <div className="inline">
            <button disabled={loading || !canContinue} onClick={handleRenderPreview}>
              {previewPath ? "Re-render preview" : "Render preview"}
            </button>
            <button className="primary" disabled={loading || !canContinue} onClick={requestRender}>
              {loading ? "Rendering..." : "Render all"}
            </button>
            {loading && onCancelRender && (
              <button type="button" onClick={onCancelRender}>
                Cancel
              </button>
            )}
            {previewPath && workspaceId && (
              <button
                disabled={downloading}
                onClick={() => {
                  const fname = previewPath.split(/[\\/]/).pop() || previewPath;
                  void download(generationDownloadUrl(workspaceId, fname), fname);
                }}
              >
                Download preview
              </button>
            )}
          </div>

          {workspaceId && previewPath && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="muted small">Rendered preview image:</div>
              {previewIsPng ? (
                <img
                  src={generationDownloadUrl(workspaceId, previewPath.split(/[\\/]/).pop() || previewPath, { cache: String(previewNonce) })}
                  alt="preview"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12 }}
                />
              ) : (
                <div className="muted small">Inline preview is only available for PNG. Use "Download preview".</div>
              )}
            </div>
          )}
        </div>
      </div>

      {workspaceId && files.length > 0 && (
        <div className="stack" style={{ gap: 16 }}>
          <h3>Results</h3>
          {usageInfo && typeof usageInfo.remaining === "number" && typeof usageInfo.limit === "number" && (
            <div className="callout">
              <div className="stack" style={{ gap: 4 }}>
                <strong>License usage</strong>
                <div className="muted small">
                  Uses remaining{usageInfo.period === "month" ? " this month" : ""}: <strong>{usageInfo.remaining}</strong> of {usageInfo.limit}
                </div>
              </div>
            </div>
          )}

          <div className="callout">
            <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
              <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
                <div>Rendered spreads: <strong>{files.length}</strong></div>
                <span className="muted small">(chronological order)</span>
              </div>
              <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
                <button className="primary" disabled={downloading} onClick={() => void download(generationDownloadAllUrl(workspaceId), "spreads.zip")}>
                  Download all spreads
                </button>
                <button disabled={downloading} onClick={() => void download(generationDownloadSpreadsheetUrl(workspaceId), `spread_data_${workspaceId}.xlsx`)}>
                  Download spreadsheet
                </button>
              </div>
            </div>
          </div>

          {files.map((fname, idx) => {
            const spreadNumber = parseSpreadNumber(fname) ?? idx + 1;
            const isPng = /\.png$/i.test(fname);
            return (
              <div key={fname} className="stack" style={{ gap: 8 }}>
                <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
                  <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
                    <strong>Spread {spreadNumber}</strong>
                    <span className="muted">{fname}</span>
                  </div>
                  <button disabled={downloading} onClick={() => void download(generationDownloadUrl(workspaceId, fname), fname)}>Download</button>
                </div>
                {isPng ? (
                  <img
                    src={generationDownloadUrl(workspaceId, fname, { cache: `${outputNonce}-${idx}` })}
                    alt={`spread-${spreadNumber}`}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12 }}
                  />
                ) : (
                  <p className="muted small">Preview not available for {fname.split(".").pop()?.toUpperCase() || "this format"}. Use Download.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
