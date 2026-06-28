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
  adjustment,
  onShiftEnabled,
  onShiftCount,
  onUploadReplacementPortrait,
  onRequestRemovePortrait,
  onRequestRemovePerson,
  onQuoteChange,
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
  adjustment: PersonAdjustment | undefined;
  onShiftEnabled: (enabled: boolean) => void;
  onShiftCount: (count: number) => void;
  onUploadReplacementPortrait: (file: File | null) => void;
  onRequestRemovePortrait: () => void;
  onRequestRemovePerson: () => void;
  onQuoteChange: (value: string) => void;
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

  return (
    <div className="person-inspector stack" style={{ gap: 16 }}>
      <div className="inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{person.first_name} {person.last_name}</strong>
          <div className="muted small">Row {person.index}</div>
        </div>
        <div className="inline" style={{ gap: 6 }}>
          <button type="button" className="icon-btn" onClick={onToggleLock} aria-label={isLocked ? "Unlock person" : "Lock person"} title={isLocked ? "Unlock" : "Lock"}>
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
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
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <section className="stack" style={{ gap: 8 }}>
        <div className="inspector-section-title">Portrait</div>
        <div className="inline" style={{ gap: 10, alignItems: "center" }}>
          {mugshotFilename && workspaceId ? (
            <button type="button" className="thumb-button" onClick={onPreviewPortrait}>
              <img src={assetUrl(workspaceId, "mugshot", mugshotFilename)} alt="Portrait" className="thumb" />
            </button>
          ) : (
            <div className="thumb thumb-placeholder thumb-placeholder-label">No portrait</div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            {usingDefaultMugshot && <span className="chip small">Using default</span>}
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
        <div className="grid two">
          <ToggleSwitch checked={Boolean(adjustment?.shiftEnabled)} onChange={onShiftEnabled} label="Shift down" disabled={isLocked} />
          <label className="field">
            <span>Shift count</span>
            <input
              type="number"
              value={adjustment?.shiftCount ?? 0}
              onChange={(e) => onShiftCount(Number(e.target.value))}
              disabled={isLocked || !adjustment?.shiftEnabled}
            />
          </label>
        </div>
      </section>

      {!skipBabyPhotos && (
        <section className="stack" style={{ gap: 8 }}>
          <div className="inspector-section-title">Baby photo</div>
          <div className="inline" style={{ gap: 10, alignItems: "center" }}>
            {babyFilename && workspaceId ? (
              <button
                type="button"
                className="thumb-button baby-thumb-editable"
                onClick={onOpenBabyEditor}
                disabled={isLocked}
                style={babyFillColor ? { backgroundColor: babyFillColor } : undefined}
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
              <div className="thumb thumb-baby thumb-placeholder thumb-placeholder-label">No baby photo</div>
            )}
            <div className="stack" style={{ gap: 4 }}>
              {usingDefaultBaby && <span className="chip small">Using default</span>}
              <button type="button" className="small" onClick={onOpenBabyEditor} disabled={isLocked || !babyFilename}>
                Edit
              </button>
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

      {!skipQuotes && (
        <section className="stack" style={{ gap: 8 }}>
          <div className="inspector-section-title">Quote</div>
          <textarea
            rows={3}
            value={displayQuote}
            onChange={(e) => onQuoteChange(e.target.value)}
            disabled={isLocked}
            placeholder="No quote"
          />
        </section>
      )}
    </div>
  );
}
