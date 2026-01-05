import React from "react";

import { generationDownloadUrl } from "../api";
import type { PersonRecord } from "../api";
import type { PlacementMode } from "../types";

type RenderPreflightProps = {
  people: PersonRecord[];
  peoplePerSpread: number;
  templateSize: { width: number; height: number } | null;

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
};

export function RenderPreflight({
  people,
  peoplePerSpread,
  templateSize,
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
  previewNonce
}: RenderPreflightProps) {
  const previewIsPng = outputFormat === "png";
  return (
    <>
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

      <div className="grid two">
        <div className="callout">
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <strong>Placement</strong>
              <div className="muted small">Choose how students are filled into a two-page spread.</div>
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
                  <div>Fill both pages simultaneously</div>
                  <div className="muted small">Uses the template’s reading order across the full spread.</div>
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
                  <div>Fill left page, then right page</div>
                  <div className="muted small">Fills the left page in reading order, then the right page in reading order.</div>
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
                  <div>Force alphabetical (by last name)</div>
                  <div className="muted small">Sorts the generation order by last name before filling slots.</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="callout">
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <strong>Export format</strong>
              <div className="muted small">Affects preview and Render all. Default: PNG</div>
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
            <div className="muted small">TIFF is a single flattened composite like PNG.</div>
          </div>
        </div>
      </div>

      <div className="callout">
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <strong>Preview render (1 page)</strong>
            <div className="muted small">Uses the first page worth of people/slots as a quick test.</div>
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
    </>
  );
}
