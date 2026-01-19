import React from "react";

import { generationDownloadUrl } from "../api";
import { InfoPopover } from "../components/InfoPopover";
import type { PersonRecord } from "../api";
import type { PlacementMode } from "../types";

type RenderPreflightProps = {
  people: PersonRecord[];
  peoplePerSpread: number;
  templateSize: { width: number; height: number } | null;

  outputSize: { width: number; height: number } | null;
  onOutputSize: (v: { width: number; height: number } | null) => void;

  outputFormat: "png" | "pdf" | "tiff";
  onOutputFormat: (v: "png" | "pdf" | "tiff") => void;

  placementMode: PlacementMode;
  onPlacementMode: (mode: PlacementMode) => void;

  forceAlphabetical: boolean;
  onForceAlphabetical: (next: boolean) => void;

  loading: boolean;
  canContinue: boolean;

  handleRenderPreview: () => void;

  workspaceId: string | null;
  previewPath: string | null;
  previewNonce: number;
  layout?: "stack" | "split";
};

export function RenderPreflight({
  people,
  peoplePerSpread,
  templateSize,
  outputSize,
  onOutputSize,
  outputFormat,
  onOutputFormat,
  placementMode,
  onPlacementMode,
  forceAlphabetical,
  onForceAlphabetical,
  loading,
  canContinue,
  handleRenderPreview,
  workspaceId,
  previewPath,
  previewNonce,
  layout = "stack"
}: RenderPreflightProps) {
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
  const statsBlock = (
    <div className="callout">
      <div className="stack" style={{ gap: 6 }}>
        <strong>Stats</strong>
        <div className="inline" style={{ gap: 14, flexWrap: "wrap" }}>
          <div className="muted small">
            Resolution: <strong>{templateSize ? `${templateSize.width} × ${templateSize.height} px` : "—"}</strong>
          </div>
          <div className="muted small">
            Estimated spreads: <strong>{peoplePerSpread > 0 ? Math.max(1, Math.ceil(people.length / peoplePerSpread)) : "—"}</strong>
            <span className="muted"> (at {peoplePerSpread} students/spread)</span>
          </div>
          <div className="muted small">
            Total students: <strong>{people.length}</strong>
          </div>
          <div className="muted small">
            Missing portrait: <strong>{people.filter((p) => !p.mugshot_filename).length}</strong>
          </div>
          <div className="muted small">
            Missing baby photo: <strong>{people.filter((p) => !p.baby_photo_filename).length}</strong>
          </div>
          <div className="muted small">
            Missing quote: <strong>{people.filter((p) => !p.quote || !p.quote.trim()).length}</strong>
          </div>
          <div className="muted small">
            Missing any: <strong>{people.filter((p) => !p.mugshot_filename || !p.baby_photo_filename || !p.quote || !p.quote.trim()).length}</strong>
          </div>
        </div>
      </div>
    </div>
  );

  const placementExportBlock = (
    <div className="grid two">
      <div className="callout">
        <div className="stack" style={{ gap: 8 }}>
          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <strong>Placement</strong>
            <InfoPopover content="Choose how students are filled into a two-page spread." ariaLabel="Placement description" />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
              <input
                type="radio"
                name="placementMode"
                value="simultaneous"
                checked={placementMode === "simultaneous"}
                onChange={() => onPlacementMode("simultaneous")}
                disabled={loading}
              />
              <div className="stack" style={{ gap: 2 }}>
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <div>Fill both pages simultaneously</div>
                  <InfoPopover content="Uses the template’s reading order across the full spread." ariaLabel="Simultaneous placement description" />
                </div>
              </div>
            </label>

            <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
              <input
                type="radio"
                name="placementMode"
                value="left_then_right"
                checked={placementMode === "left_then_right"}
                onChange={() => onPlacementMode("left_then_right")}
                disabled={loading}
              />
              <div className="stack" style={{ gap: 2 }}>
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <div>Fill left page, then right page</div>
                  <InfoPopover content="Fills the left page in reading order, then the right page in reading order." ariaLabel="Left then right placement description" />
                </div>
              </div>
            </label>

            <label className="inline" style={{ alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={forceAlphabetical}
                onChange={(e) => onForceAlphabetical(e.target.checked)}
                disabled={loading}
              />
              <div className="stack" style={{ gap: 2 }}>
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <div>Force alphabetical (by last name)</div>
                  <InfoPopover content="Sorts the generation order by last name before filling slots." ariaLabel="Alphabetical placement description" />
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="callout">
        <div className="stack" style={{ gap: 8 }}>
          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <strong>Export format</strong>
            <InfoPopover content="Affects preview and Render all. Default: PNG. TIFF is a single flattened composite like PNG." ariaLabel="Export format description" />
          </div>
          <select
            value={outputFormat}
            onChange={(e) => onOutputFormat(e.target.value as "png" | "pdf" | "tiff")}
            disabled={loading}
          >
            <option value="png">PNG (default)</option>
            <option value="pdf">PDF</option>
            <option value="tiff">TIFF</option>
          </select>
          <div style={{ height: 4 }} />

          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <strong>Export quality</strong>
            <InfoPopover content="Choose an output resolution. Max is the template’s original resolution. Aspect ratio is locked to match the template." ariaLabel="Export quality description" />
          </div>
          <select
            value={exportQualityMode}
            onChange={(e) => {
              const mode = e.target.value as "original" | "custom";
              if (mode === "original") {
                onOutputSize(null);
              } else if (templateSize) {
                onOutputSize({ width: templateSize.width, height: templateSize.height });
              }
            }}
            disabled={loading || !hasTemplateSize}
          >
            <option value="original">Original{templateSize ? ` (${templateSize.width} × ${templateSize.height})` : ""}</option>
            <option value="custom">Custom resolution…</option>
          </select>

          {hasTemplateSize && exportQualityMode === "custom" && outputSize && (
            <div className="grid two" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted small">Width (px)</span>
                <input
                  type="number"
                  min={1}
                  max={templateSize!.width}
                  value={outputSize.width}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setCustomWidth(n);
                  }}
                  disabled={loading}
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted small">Height (px)</span>
                <input
                  type="number"
                  min={1}
                  max={templateSize!.height}
                  value={outputSize.height}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setCustomHeight(n);
                  }}
                  disabled={loading}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const placementBlock = (
    <div className="callout">
      <div className="stack" style={{ gap: 8 }}>
        <div className="inline" style={{ alignItems: "center", gap: 6 }}>
          <strong>Placement</strong>
          <InfoPopover content="Choose how students are filled into a two-page spread." ariaLabel="Placement description" />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
            <input
              type="radio"
              name="placementMode"
              value="simultaneous"
              checked={placementMode === "simultaneous"}
              onChange={() => onPlacementMode("simultaneous")}
              disabled={loading}
            />
            <div className="stack" style={{ gap: 2 }}>
              <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                <div>Fill both pages simultaneously</div>
                <InfoPopover content="Uses the template’s reading order across the full spread." ariaLabel="Simultaneous placement description" />
              </div>
            </div>
          </label>

          <label className="inline" style={{ alignItems: "flex-start", gap: 10 }}>
            <input
              type="radio"
              name="placementMode"
              value="left_then_right"
              checked={placementMode === "left_then_right"}
              onChange={() => onPlacementMode("left_then_right")}
              disabled={loading}
            />
            <div className="stack" style={{ gap: 2 }}>
              <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                <div>Fill left page, then right page</div>
                <InfoPopover content="Fills the left page in reading order, then the right page in reading order." ariaLabel="Left then right placement description" />
              </div>
            </div>
          </label>

          <label className="inline" style={{ alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={forceAlphabetical}
              onChange={(e) => onForceAlphabetical(e.target.checked)}
              disabled={loading}
            />
            <div className="stack" style={{ gap: 2 }}>
              <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                <div>Force alphabetical (by last name)</div>
                <InfoPopover content="Sorts the generation order by last name before filling slots." ariaLabel="Alphabetical placement description" />
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  const exportBlock = (
    <div className="callout">
      <div className="stack" style={{ gap: 8 }}>
        <div className="inline" style={{ alignItems: "center", gap: 6 }}>
          <strong>Export format</strong>
          <InfoPopover content="Affects preview and Render all. Default: PNG. TIFF is a single flattened composite like PNG." ariaLabel="Export format description" />
        </div>
        <select
          value={outputFormat}
          onChange={(e) => onOutputFormat(e.target.value as "png" | "pdf" | "tiff")}
          disabled={loading}
        >
          <option value="png">PNG (default)</option>
          <option value="pdf">PDF</option>
          <option value="tiff">TIFF</option>
        </select>
        <div style={{ height: 4 }} />

        <div className="inline" style={{ alignItems: "center", gap: 6 }}>
          <strong>Export quality</strong>
          <InfoPopover content="Choose an output resolution. Max is the template’s original resolution. Aspect ratio is locked to match the template." ariaLabel="Export quality description" />
        </div>
        <select
          value={exportQualityMode}
          onChange={(e) => {
            const mode = e.target.value as "original" | "custom";
            if (mode === "original") {
              onOutputSize(null);
            } else if (templateSize) {
              onOutputSize({ width: templateSize.width, height: templateSize.height });
            }
          }}
          disabled={loading || !hasTemplateSize}
        >
          <option value="original">Original{templateSize ? ` (${templateSize.width} × ${templateSize.height})` : ""}</option>
          <option value="custom">Custom resolution…</option>
        </select>

        {hasTemplateSize && exportQualityMode === "custom" && outputSize && (
          <div className="grid two" style={{ gap: 10 }}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="muted small">Width (px)</span>
              <input
                type="number"
                min={1}
                max={templateSize!.width}
                value={outputSize.width}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setCustomWidth(n);
                }}
                disabled={loading}
              />
            </label>
            <label className="stack" style={{ gap: 6 }}>
              <span className="muted small">Height (px)</span>
              <input
                type="number"
                min={1}
                max={templateSize!.height}
                value={outputSize.height}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setCustomHeight(n);
                }}
                disabled={loading}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );

  const previewBlock = (
    <div className="callout">
      <div className="stack" style={{ gap: 10 }}>
        <div className="inline" style={{ alignItems: "center", gap: 6 }}>
          <strong>Preview render (1 page)</strong>
          <InfoPopover content="Uses the first page worth of people/slots as a quick test." ariaLabel="Preview render description" />
        </div>
        <div className="inline">
          <button className="primary" disabled={loading || !canContinue} onClick={handleRenderPreview}>
            {previewPath ? "Re-render preview" : "Render preview"}
          </button>
          {previewPath && workspaceId && (
            <button
              onClick={() => {
                const fname = previewPath.split(/[\\/]/).pop() || previewPath;
                window.open(generationDownloadUrl(workspaceId, fname), "_blank");
              }}
            >
              Download preview
            </button>
          )}
        </div>

        {workspaceId && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="muted small">Rendered preview image:</div>
            {previewIsPng ? (
              <img
                src={
                  previewPath
                    ? generationDownloadUrl(workspaceId, previewPath.split(/[\\/]/).pop() || previewPath, {
                        cache: String(previewNonce)
                      })
                    : ""
                }
                alt="preview"
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12 }}
              />
            ) : (
              <div className="muted small">
                Inline preview is only available for PNG. Use “Download preview”.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (layout === "split") {
    return (
      <div className="review-split">
        <div className="review-split-left">
          {previewBlock}
        </div>
        <div className="review-split-right stack" style={{ gap: 12 }}>
          {statsBlock}
          {placementBlock}
          {exportBlock}
        </div>
      </div>
    );
  }

  return (
    <>
      {statsBlock}
      {placementExportBlock}
      {previewBlock}
    </>
  );
}
