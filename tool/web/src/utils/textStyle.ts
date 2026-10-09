// F1 text styling: one object for every new name/quote text control, so App state,
// the session, config export/import and the generate request each carry a single field.
// Every default equals today's output, so old sessions render unchanged.

export type TextShadowSetting = {
  offset_x: number;
  offset_y: number;
  blur: number;
  color: string;
  opacity: number;
};

export type TextStyleSetting = {
  /** Only "right" (names and quotes) or "justify" (quotes) override the left/centre buttons. */
  alignExtra: "" | "right" | "justify";
  color: string;
  valign: "top" | "middle" | "bottom";
  /** Empty string means today's spacing. */
  lineSpacing: string;
  letterSpacing: number;
  strokeWidth: number;
  strokeColor: string;
  shadow: TextShadowSetting | null;
  fontStyle: "normal" | "italic";
  minSize: number;
};

export type TextStylesSetting = {
  name: TextStyleSetting;
  quote: TextStyleSetting;
  nameFit: "shrink" | "wrap";
};

export const DEFAULT_TEXT_COLOR = "#141e32";
export const DEFAULT_SHADOW: TextShadowSetting = { offset_x: 3, offset_y: 3, blur: 4, color: "#000000", opacity: 0.5 };

export const DEFAULT_TEXT_STYLE: TextStyleSetting = {
  alignExtra: "",
  color: DEFAULT_TEXT_COLOR,
  valign: "top",
  lineSpacing: "",
  letterSpacing: 0,
  strokeWidth: 0,
  strokeColor: "#ffffff",
  shadow: null,
  fontStyle: "normal",
  minSize: 8,
};

export const DEFAULT_TEXT_STYLES: TextStylesSetting = {
  name: DEFAULT_TEXT_STYLE,
  quote: DEFAULT_TEXT_STYLE,
  nameFit: "shrink",
};

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHexColour = (v: unknown): v is string => typeof v === "string" && HEX_RE.test(v.trim());
export const normaliseHex = (v: string): string => {
  const t = v.trim().replace(/^#/, "");
  const full = t.length === 3 ? t.split("").map((c) => c + c).join("") : t;
  return `#${full.toLowerCase()}`;
};

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

const parseStyle = (raw: unknown, kind: "name" | "quote"): TextStyleSetting => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TEXT_STYLE;
  const extra = r.alignExtra === "right" || (r.alignExtra === "justify" && kind === "quote") ? r.alignExtra : "";
  const ls = typeof r.lineSpacing === "string" ? Number(r.lineSpacing) : NaN;
  let shadow: TextShadowSetting | null = null;
  if (r.shadow && typeof r.shadow === "object") {
    const s = r.shadow as Record<string, unknown>;
    shadow = {
      offset_x: clampInt(s.offset_x, -200, 200, DEFAULT_SHADOW.offset_x),
      offset_y: clampInt(s.offset_y, -200, 200, DEFAULT_SHADOW.offset_y),
      blur: clampInt(s.blur, 0, 20, DEFAULT_SHADOW.blur),
      color: isHexColour(s.color) ? normaliseHex(s.color) : DEFAULT_SHADOW.color,
      opacity: typeof s.opacity === "number" && s.opacity >= 0 && s.opacity <= 1 ? s.opacity : DEFAULT_SHADOW.opacity,
    };
  }
  return {
    alignExtra: extra,
    color: isHexColour(r.color) ? normaliseHex(r.color) : d.color,
    valign: r.valign === "middle" || r.valign === "bottom" ? r.valign : "top",
    lineSpacing: Number.isFinite(ls) && ls >= 0.5 && ls <= 3 ? String(ls) : "",
    letterSpacing: clampInt(r.letterSpacing, -5, 50, 0),
    strokeWidth: clampInt(r.strokeWidth, 0, 20, 0),
    strokeColor: isHexColour(r.strokeColor) ? normaliseHex(r.strokeColor) : d.strokeColor,
    shadow,
    fontStyle: r.fontStyle === "italic" ? "italic" : "normal",
    minSize: clampInt(r.minSize, 6, 200, 8),
  };
};

/** Restore from a saved session/config. Missing or malformed input yields today's defaults. */
export const parseTextStyles = (raw: unknown): TextStylesSetting => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: parseStyle(r.name, "name"),
    quote: parseStyle(r.quote, "quote"),
    nameFit: r.nameFit === "wrap" ? "wrap" : "shrink",
  };
};

export const isDefaultTextStyles = (s: TextStylesSetting): boolean =>
  JSON.stringify(s) === JSON.stringify(DEFAULT_TEXT_STYLES);

/** Request fields for one prefix. Defaults are omitted so legacy requests stay byte-identical. */
const styleFields = (s: TextStyleSetting, prefix: "name" | "quote", base: "left" | "center") => {
  const out: Record<string, unknown> = {};
  if (s.alignExtra) out[`${prefix}_align`] = s.alignExtra;
  else out[`${prefix}_align`] = base;
  if (s.color !== DEFAULT_TEXT_COLOR) out[`${prefix}_color`] = s.color;
  if (s.valign !== "top") out[`${prefix}_valign`] = s.valign;
  if (s.lineSpacing !== "") out[`${prefix}_line_spacing`] = Number(s.lineSpacing);
  if (s.letterSpacing !== 0) out[`${prefix}_letter_spacing`] = s.letterSpacing;
  if (s.strokeWidth !== 0) {
    out[`${prefix}_stroke_width`] = s.strokeWidth;
    out[`${prefix}_stroke_color`] = s.strokeColor;
  }
  if (s.shadow) out[`${prefix}_shadow`] = s.shadow;
  if (s.fontStyle !== "normal") out[`${prefix}_font_style`] = s.fontStyle;
  if (s.minSize !== 8) out[`${prefix}_min_size`] = s.minSize;
  return out;
};

export const textStyleRequestFields = (
  s: TextStylesSetting,
  nameAlign: "left" | "center",
  quoteAlign: "left" | "center",
): Record<string, unknown> => ({
  ...styleFields(s.name, "name", nameAlign),
  ...styleFields(s.quote, "quote", quoteAlign),
  ...(s.nameFit === "wrap" ? { name_fit: "wrap" } : {}),
});
