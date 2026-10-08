import type React from "react";
import { Lock, Unlock, Trash2, ImageOff, RotateCcw, Pencil } from "lucide-react";
import { assetUrl, type PersonRecord } from "../api";
import { InfoPopover } from "./InfoPopover";
import { ToggleSwitch } from "./ToggleSwitch";

export type PersonAdjustment = {
  shiftEnabled?: boolean;
  shiftCount?: number;
  replacement_mugshot?: string;
  remove?: boolean;
};

export function PersonInspector({
  person,
  workspaceId,
  skipQuotes,
  skipBabyPhotos,
  isLocked,
  onToggleLock,
  assignedDefaultMugshot,
  assignedDefaultQuote,
  defaultQuoteFallback,
  babyFilename,
  babyMaskCssUrl,
  babyFillColor,
  babyAspect,
  adjustment,
  onShiftEnabled,
  onShiftCount,
  onUploadReplacementPortrait,
  onRequestRemovePortrait,
  onRequestRemovePerson,
  onNameChange,
  onQuoteChange,
  onQuoteBlank,
  onOpenBabyEditor,
  onUploadReplacementBaby,
  onResetBabyToOriginal,
  onRemoveBabyFromPerson,
  onPreviewPortrait,
  loading,
}: {
  person: PersonRecord;
  workspaceId: string | null;
  skipQuotes: boolean;
  skipBabyPhotos: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
  assignedDefaultMugshot: string | null;
  assignedDefaultQuote: string;
  defaultQuoteFallback: string;
  babyFilename: string | null;
  babyMaskCssUrl: string | null;
  babyFillColor: string | null;
  babyAspect: number;
  adjustment: PersonAdjustment | undefined;
  onShiftEnabled: (enabled: boolean) => void;
  onShiftCount: (count: number) => void;
  onUploadReplacementPortrait: (file: File | null) => void;
  onRequestRemovePortrait: () => void;
  onRequestRemovePerson: () => void;
  onNameChange: (field: "first_name" | "last_name", value: string) => void;
  onQuoteChange: (value: string) => void;
  onQuoteBlank: (value: boolean) => void;
  onOpenBabyEditor: () => void;
  onUploadReplacementBaby: (file: File | null) => void;
  onResetBabyToOriginal: () => void;
  onRemoveBabyFromPerson: () => void;
  onPreviewPortrait: () => void;
  loading: boolean;
}) {
  const mugshotFilename = person.mugshot_filename || assignedDefaultMugshot || null;
  const usingDefaultMugshot = !person.mugshot_filename && Boolean(assignedDefaultMugshot);
  const usingDefaultBaby = !person.baby_photo_filename && Boolean(babyFilename);
  const displayQuote = (person.quote ?? "").trim() ? person.quote ?? "" : assignedDefaultQuote || defaultQuoteFallback;

  // Baby thumbnail: fixed height, width follows the parsed slot aspect ratio so it
  // matches the People-grid shape and the actual template slot.
  const PI_BABY_HEIGHT = 76;
  const babyThumbStyle: React.CSSProperties = {
    width: Math.max(40, Math.round(PI_BABY_HEIGHT * (babyAspect || 1))),
    height: PI_BABY_HEIGHT,
  };

  return (
    <div className="person-inspector">
      <div className="pi-head">
        <div className="pi-head-text">
          <strong>{person.first_name} {person.last_name}</strong>
          <div className="muted small">Row {person.index}</div>
        </div>
        <div className="inline" style={{ gap: 4 }}>
          <button type="button" className="icon-btn" onClick={onToggleLock} aria-label={isLocked ? "Unlock person" : "Lock person"} title={isLocked ? "Unlock" : "Lock"}>
            {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <InfoPopover
            content="Locking a person protects their portrait/row from edits and swaps, but they will still be included in the final result."
            ariaLabel="Lock person description"
            position="below"
          />
          <button
            type="button"
            className="icon-btn danger"
            onClick={onRequestRemovePerson}
            aria-label="Remove person"
            title="Remove person"
            disabled={isLocked}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <section className="pi-section">
        <div className="inspector-section-title">Name</div>
        <label className="field"><span>First name</span><input maxLength={200} value={person.first_name} disabled={loading || isLocked} onChange={e => onNameChange("first_name", e.target.value)} /></label>
        <label className="field"><span>Last name</span><input maxLength={200} value={person.last_name} disabled={loading || isLocked} onChange={e => onNameChange("last_name", e.target.value)} /></label>
      </section>

      <section className="pi-section">
        <div className="inspector-section-title">Portrait</div>
        <div className="pi-row">
          {mugshotFilename && workspaceId ? (
            <button type="button" className="thumb-button pi-thumb" onClick={onPreviewPortrait}>
              <img src={assetUrl(workspaceId, "mugshot", mugshotFilename)} alt="Portrait" className="thumb" />
            </button>
          ) : (
            <div className="thumb pi-thumb thumb-placeholder thumb-placeholder-label">No portrait</div>
          )}
          <div className="pi-actions">
            {usingDefaultMugshot && <span className="chip small pi-chip">Using default</span>}
            <label className="upload-file-button small">
              Replace
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={loading || isLocked}
                onChange={(e) => onUploadReplacementPortrait(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="small danger" onClick={onRequestRemovePortrait} disabled={isLocked}>
              Remove
            </button>
          </div>
        </div>
      </section>

      {!skipBabyPhotos && (
        <section className="pi-section">
          <div className="inspector-section-title">Baby photo</div>
          <div className="pi-row">
            {babyFilename && workspaceId ? (
              <button
                type="button"
                className="thumb-button baby-thumb-editable pi-thumb pi-baby-thumb"
                onClick={onOpenBabyEditor}
                disabled={isLocked}
                style={{ ...babyThumbStyle, ...(babyFillColor ? { backgroundColor: babyFillColor } : {}) }}
              >
                <img
                  src={assetUrl(workspaceId, "baby", babyFilename)}
                  alt="Baby"
                  className={babyMaskCssUrl ? "baby-thumb-img baby-thumb-masked" : "baby-thumb-img"}
                  style={babyMaskCssUrl ? ({ ["--baby-mask" as never]: babyMaskCssUrl } as React.CSSProperties) : undefined}
                />
                <span className="baby-thumb-hover"><Pencil size={16} /></span>
              </button>
            ) : (
              <div className="thumb pi-thumb pi-baby-thumb thumb-placeholder thumb-placeholder-label" style={babyThumbStyle}>No baby photo</div>
            )}
            <div className="pi-actions pi-actions-grid">
              {usingDefaultBaby && <span className="chip small pi-chip">Using default</span>}
              <button type="button" className="small" onClick={onOpenBabyEditor} disabled={isLocked || !babyFilename}>
                <Pencil size={13} /> Edit
              </button>
              {person.baby_background_removal_failed && babyFilename && (
                <>
                  <span className="muted small" style={{ gridColumn: "1 / -1", whiteSpace: "normal" }}>Background removal failed. Original photo kept.</span>
                  <button type="button" className="small" style={{ gridColumn: "1 / -1", whiteSpace: "normal" }} onClick={onOpenBabyEditor} disabled={loading || isLocked}>
                    <RotateCcw size={13} /> Retry background removal
                  </button>
                </>
              )}
              <label className="upload-file-button small">
                Replace
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={loading || isLocked}
                  onChange={(e) => onUploadReplacementBaby(e.target.files?.[0] ?? null)}
                />
              </label>
              <button type="button" className="small" onClick={onResetBabyToOriginal} disabled={isLocked}>
                <RotateCcw size={13} /> Reset
              </button>
              <button type="button" className="small danger" onClick={onRemoveBabyFromPerson} disabled={isLocked}>
                <ImageOff size={13} /> Remove
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="pi-section">
        <div className="inspector-section-title">Mapping</div>
        <div className="pi-shift">
          <ToggleSwitch checked={Boolean(adjustment?.shiftEnabled)} onChange={onShiftEnabled} label="Shift down" disabled={isLocked} />
          <label className="field pi-shift-count">
            <span>Count</span>
            <input
              type="number"
              value={adjustment?.shiftCount ?? 0}
              onChange={(e) => onShiftCount(Number(e.target.value))}
              disabled={isLocked || !adjustment?.shiftEnabled}
            />
          </label>
        </div>
      </section>

      {!skipQuotes && (
        <section className="pi-section pi-quote">
          <div className="inspector-section-title">Quote</div>
          {!person.quote?.trim() && !person.quote_blank && <p className="muted small">Using the default quote</p>}
          <ToggleSwitch checked={Boolean(person.quote_blank)} onChange={onQuoteBlank} label="No quote for this student" disabled={isLocked} />
          <textarea
            rows={3}
            value={person.quote ?? ""}
            onChange={(e) => onQuoteChange(e.target.value)}
            disabled={isLocked}
            placeholder={displayQuote}
          />
        </section>
      )}
    </div>
  );
}
