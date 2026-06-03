import { useEffect, useRef, useState } from "react";
import type { Align, FontWeight } from "../types";
import { ToggleSwitch } from "./ToggleSwitch";

export function FontPick({
  label,
  fontFamily,
  onFontFamily,
  fontWeight,
  onFontWeight,
  fontSize,
  onFontSize,
  allCaps,
  onAllCaps,
  align,
  onAlign,
  availableFonts,
}: {
  label: string;
  fontFamily: string;
  onFontFamily: (v: string) => void;
  fontWeight: FontWeight;
  onFontWeight: (v: FontWeight) => void;
  fontSize: number;
  onFontSize: (v: number) => void;
  allCaps: boolean;
  onAllCaps: (v: boolean) => void;
  align: Align;
  onAlign: (v: Align) => void;
  availableFonts: { name: string; filename: string; source?: string }[];
}) {
  const MIN_FONT_SIZE = 1;
  const MAX_FONT_SIZE = 100;
  const [fontSizeDraft, setFontSizeDraft] = useState<string>(String(fontSize));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setFontSizeDraft(String(fontSize));
    }
  }, [fontSize]);

  const commitFontSize = () => {
    const raw = fontSizeDraft.trim();
    if (!raw) {
      // User cleared the box but didn't commit a new number.
      setFontSizeDraft(String(fontSize));
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setFontSizeDraft(String(fontSize));
      return;
    }

    const rounded = Math.round(parsed);
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, rounded));
    onFontSize(clamped);
    setFontSizeDraft(String(clamped));
  };

  return (
    <div className="callout">
      <div className="stack">
        <strong>{label}</strong>
        <div className="grid two">
          <label className="field">
            <span>Font size (pt)</span>
            <input
              type="number"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={fontSizeDraft}
              onFocus={() => {
                isEditingRef.current = true;
              }}
              onChange={(e) => {
                setFontSizeDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitFontSize();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  setFontSizeDraft(String(fontSize));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={() => {
                isEditingRef.current = false;
                commitFontSize();
              }}
            />
          </label>
          <label className="field">
            <span>Weight</span>
            <select value={fontWeight} onChange={(e) => onFontWeight(e.target.value as FontWeight)}>
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </label>
        </div>

        <div className="grid two">
          <label className="field">
            <span>Align</span>
            <select value={align} onChange={(e) => onAlign(e.target.value as Align)}>
              <option value="left">Left</option>
              <option value="center">Centre</option>
            </select>
          </label>
          <ToggleSwitch checked={allCaps} onChange={onAllCaps} label="All caps" style={{ alignSelf: "end" }} />
        </div>

        <label className="field">
          <span>Font family</span>
          <input value={fontFamily} onChange={(e) => onFontFamily(e.target.value)} placeholder='e.g. "Georgia"' />
        </label>
        <label className="field">
          <span>Pick from system/uploaded</span>
          <select onChange={(e) => onFontFamily(e.target.value)} value={fontFamily}>
            <option value={fontFamily}>{fontFamily}</option>
            {availableFonts.map((f) => (
              <option key={`${label}-${f.source}-${f.filename}`} value={`"${f.name}"`}>
                {`${f.name} (${f.source ?? "system"})`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
