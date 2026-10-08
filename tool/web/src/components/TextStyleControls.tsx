import { useState } from "react";
import { DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, isHexColour, normaliseHex, type TextStyleSetting } from "../utils/textStyle";

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const valid = isHexColour(shown);
  return (
    <label className="field">
      <span>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={value}
          onChange={(e) => {
            setDraft(null);
            onChange(normaliseHex(e.target.value));
          }}
          style={{ width: 44, padding: 2 }}
        />
        <input
          aria-label={`${label} hex`}
          value={shown}
          aria-invalid={!valid}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHexColour(e.target.value)) onChange(normaliseHex(e.target.value));
          }}
          onBlur={() => setDraft(null)}
          placeholder="#141e32"
        />
      </div>
      {!valid && <span className="muted small">Use a hex colour like #141e32.</span>}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}

export function TextStyleControls({
  kind,
  label,
  value,
  onChange,
  nameFit,
  onNameFit,
}: {
  kind: "name" | "quote";
  label: string;
  value: TextStyleSetting;
  onChange: (v: TextStyleSetting) => void;
  nameFit?: "shrink" | "wrap";
  onNameFit?: (v: "shrink" | "wrap") => void;
}) {
  const set = (patch: Partial<TextStyleSetting>) => onChange({ ...value, ...patch });
  const shadow = value.shadow;
  return (
    <details className="callout" data-testid={`text-style-${kind}`}>
      <summary>
        <strong>{label}: colour, spacing, outline, shadow</strong>
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="grid two">
          <ColourField label="Text colour" value={value.color} onChange={(color) => set({ color })} />
          <label className="field">
            <span>Font style</span>
            <select aria-label="Font style" value={value.fontStyle} onChange={(e) => set({ fontStyle: e.target.value as "normal" | "italic" })}>
              <option value="normal">Upright</option>
              <option value="italic">Italic</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label className="field">
            <span>Right or justified</span>
            <select value={value.alignExtra} onChange={(e) => set({ alignExtra: e.target.value as TextStyleSetting["alignExtra"] })}>
              <option value="">Use Align above</option>
              <option value="right">Right</option>
              {kind === "quote" && <option value="justify">Justify (last line left)</option>}
            </select>
          </label>
          <label className="field">
            <span>Vertical position in the box</span>
            <select value={value.valign} onChange={(e) => set({ valign: e.target.value as TextStyleSetting["valign"] })}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label className="field">
            <span>Line spacing (0.5 to 3, blank = standard)</span>
            <input
              type="number"
              min={0.5}
              max={3}
              step={0.1}
              value={value.lineSpacing}
              placeholder="Standard"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return set({ lineSpacing: "" });
                const n = Number(raw);
                if (Number.isFinite(n)) set({ lineSpacing: String(Math.min(3, Math.max(0.5, n))) });
              }}
            />
          </label>
          <NumberField label="Letter spacing (px)" value={value.letterSpacing} min={-5} max={50} onChange={(letterSpacing) => set({ letterSpacing })} />
        </div>
        <div className="grid two">
          <NumberField label="Outline width (px, 0 = none)" value={value.strokeWidth} min={0} max={20} onChange={(strokeWidth) => set({ strokeWidth })} />
          {value.strokeWidth > 0 && <ColourField label="Outline colour" value={value.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={Boolean(shadow)}
            onChange={(e) => set({ shadow: e.target.checked ? { ...DEFAULT_SHADOW } : null })}
          />
          <span>Drop shadow</span>
        </label>
        {shadow && (
          <div className="grid two">
            <NumberField label="Shadow across (px)" value={shadow.offset_x} min={-200} max={200} onChange={(offset_x) => set({ shadow: { ...shadow, offset_x } })} />
            <NumberField label="Shadow down (px)" value={shadow.offset_y} min={-200} max={200} onChange={(offset_y) => set({ shadow: { ...shadow, offset_y } })} />
            <NumberField label="Shadow blur (0 to 20)" value={shadow.blur} min={0} max={20} onChange={(blur) => set({ shadow: { ...shadow, blur } })} />
            <NumberField label="Shadow strength (0 to 1)" value={shadow.opacity} min={0} max={1} step={0.1} onChange={(opacity) => set({ shadow: { ...shadow, opacity } })} />
            <ColourField label="Shadow colour" value={shadow.color} onChange={(color) => set({ shadow: { ...shadow, color } })} />
          </div>
        )}
        <div className="grid two">
          {kind === "name" && onNameFit && (
            <label className="field">
              <span>Long names</span>
              <select value={nameFit ?? "shrink"} onChange={(e) => onNameFit(e.target.value as "shrink" | "wrap")}>
                <option value="shrink">Shrink to fit on one line</option>
                <option value="wrap">Allow two lines before shrinking</option>
              </select>
            </label>
          )}
          <NumberField label="Smallest size allowed (pt)" value={value.minSize} min={6} max={200} onChange={(minSize) => set({ minSize })} />
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_TEXT_STYLE })}>
          Reset these to standard
        </button>
      </div>
    </details>
  );
}
