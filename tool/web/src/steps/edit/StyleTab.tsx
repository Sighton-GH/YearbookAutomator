import type React from "react";
import { useState } from "react";
import type { Align, FontWeight } from "../../types";
import { uploadFont } from "../../api";
import { FontPick } from "../../components/FontPick";
import { UploadDropLabel } from "../../components/UploadDropLabel";
import { TextStyleControls } from "../../components/TextStyleControls";
import type { TextStylesSetting } from "../../utils/textStyle";

export function StyleTab({
  skipQuotes,
  nameFontFamily,
  nameFontWeight,
  nameFontSize,
  nameAllCaps,
  nameAlign,
  onNameFontFamily,
  onNameFontWeight,
  onNameFontSize,
  onNameAllCaps,
  onNameAlign,
  quoteFontFamily,
  quoteFontWeight,
  quoteFontSize,
  quoteAllCaps,
  quoteAlign,
  onQuoteFontFamily,
  onQuoteFontWeight,
  onQuoteFontSize,
  onQuoteAllCaps,
  onQuoteAlign,
  textStyles,
  onTextStyles,
  onRenderStyleStrip,
  workspaceId,
  availableFonts,
  setAvailableFonts,
  customFontUploadEnabled,
}: {
  skipQuotes: boolean;
  nameFontFamily: string;
  nameFontWeight: FontWeight;
  nameFontSize: number;
  nameAllCaps: boolean;
  nameAlign: Align;
  onNameFontFamily: (v: string) => void;
  onNameFontWeight: (v: FontWeight) => void;
  onNameFontSize: (v: number) => void;
  onNameAllCaps: (v: boolean) => void;
  onNameAlign: (v: Align) => void;
  quoteFontFamily: string;
  quoteFontWeight: FontWeight;
  quoteFontSize: number;
  quoteAllCaps: boolean;
  quoteAlign: Align;
  onQuoteFontFamily: (v: string) => void;
  onQuoteFontWeight: (v: FontWeight) => void;
  onQuoteFontSize: (v: number) => void;
  onQuoteAllCaps: (v: boolean) => void;
  onQuoteAlign: (v: Align) => void;
  textStyles: TextStylesSetting;
  onTextStyles: (v: TextStylesSetting) => void;
  onRenderStyleStrip: () => Promise<{ url: string; warnings: string[] }>;
  workspaceId: string | null;
  availableFonts: { name: string; filename: string; source?: string }[];
  setAvailableFonts: (fonts: { name: string; filename: string; source?: string }[]) => void;
  customFontUploadEnabled: boolean;
}) {
  return (
    <div className="style-layout">
      <div className="style-controls stack-4">
        <FontPick
          label="Name styling"
          fontFamily={nameFontFamily}
          onFontFamily={onNameFontFamily}
          fontWeight={nameFontWeight}
          onFontWeight={onNameFontWeight}
          fontSize={nameFontSize}
          onFontSize={onNameFontSize}
          allCaps={nameAllCaps}
          onAllCaps={onNameAllCaps}
          align={nameAlign}
          onAlign={onNameAlign}
          availableFonts={availableFonts}
        />
        <TextStyleControls
          kind="name"
          label="Name"
          value={textStyles.name}
          onChange={(name) => onTextStyles({ ...textStyles, name })}
          nameFit={textStyles.nameFit}
          onNameFit={(nameFit) => onTextStyles({ ...textStyles, nameFit })}
        />

        {!skipQuotes && (
          <FontPick
            label="Quote styling"
            fontFamily={quoteFontFamily}
            onFontFamily={onQuoteFontFamily}
            fontWeight={quoteFontWeight}
            onFontWeight={onQuoteFontWeight}
            fontSize={quoteFontSize}
            onFontSize={onQuoteFontSize}
            allCaps={quoteAllCaps}
            onAllCaps={onQuoteAllCaps}
            align={quoteAlign}
            onAlign={onQuoteAlign}
            availableFonts={availableFonts}
          />
        )}
        {!skipQuotes && (
          <TextStyleControls kind="quote" label="Quote" value={textStyles.quote} onChange={(quote) => onTextStyles({ ...textStyles, quote })} />
        )}

        {customFontUploadEnabled && (
          <FontLoader availableFonts={availableFonts} setAvailableFonts={setAvailableFonts} workspaceId={workspaceId} onFontFamily={onNameFontFamily} />
        )}
      </div>

      <StylePreview
        skipQuotes={skipQuotes}
        nameFontFamily={nameFontFamily}
        nameFontWeight={nameFontWeight}
        nameFontSize={nameFontSize}
        nameAllCaps={nameAllCaps}
        nameAlign={nameAlign}
        quoteFontFamily={quoteFontFamily}
        quoteFontWeight={quoteFontWeight}
        quoteFontSize={quoteFontSize}
        quoteAllCaps={quoteAllCaps}
        quoteAlign={quoteAlign}
        textStyles={textStyles}
        onRenderStyleStrip={onRenderStyleStrip}
        canRender={Boolean(workspaceId)}
      />
    </div>
  );
}

// Scales a point size into a representative on-screen preview size (keeps the relative
// difference between name & quote without letting big point sizes overflow the panel).
const previewPx = (pt: number) => Math.round(Math.max(15, Math.min(58, pt * 0.85)));

function StylePreview({
  skipQuotes,
  nameFontFamily,
  nameFontWeight,
  nameFontSize,
  nameAllCaps,
  nameAlign,
  quoteFontFamily,
  quoteFontWeight,
  quoteFontSize,
  quoteAllCaps,
  quoteAlign,
  textStyles,
  onRenderStyleStrip,
  canRender,
}: {
  textStyles: TextStylesSetting;
  onRenderStyleStrip: () => Promise<{ url: string; warnings: string[] }>;
  canRender: boolean;
  skipQuotes: boolean;
  nameFontFamily: string;
  nameFontWeight: FontWeight;
  nameFontSize: number;
  nameAllCaps: boolean;
  nameAlign: Align;
  quoteFontFamily: string;
  quoteFontWeight: FontWeight;
  quoteFontSize: number;
  quoteAllCaps: boolean;
  quoteAlign: Align;
}) {
  const [strip, setStrip] = useState<{ url: string; warnings: string[] } | null>(null);
  const [stripBusy, setStripBusy] = useState(false);
  const [stripError, setStripError] = useState<string | null>(null);
  const renderStrip = async () => {
    setStripBusy(true);
    setStripError(null);
    try {
      const next = await onRenderStyleStrip();
      setStrip((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return next;
      });
    } catch (err) {
      setStripError(err instanceof Error && err.message ? err.message : "The test render did not finish. Try again in a moment.");
    } finally {
      setStripBusy(false);
    }
  };
  const cssOf = (s: TextStylesSetting["name"], align: Align): React.CSSProperties => ({
    color: s.color,
    fontStyle: s.fontStyle,
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    lineHeight: s.lineSpacing ? Number(s.lineSpacing) : undefined,
    textAlign: s.alignExtra || align,
    WebkitTextStroke: s.strokeWidth ? `${Math.min(s.strokeWidth, 4)}px ${s.strokeColor}` : undefined,
    textShadow: s.shadow ? `${s.shadow.offset_x}px ${s.shadow.offset_y}px ${s.shadow.blur}px ${s.shadow.color}` : undefined,
  });
  const nameStyle: React.CSSProperties = {
    ...cssOf(textStyles.name, nameAlign),
    fontFamily: nameFontFamily,
    fontSize: previewPx(nameFontSize),
    fontWeight: nameFontWeight === "bold" ? 700 : 400,
    textTransform: nameAllCaps ? "uppercase" : "none",
  };
  const quoteStyle: React.CSSProperties = {
    ...cssOf(textStyles.quote, quoteAlign),
    fontFamily: quoteFontFamily,
    fontSize: previewPx(quoteFontSize),
    fontWeight: quoteFontWeight === "bold" ? 700 : 400,
    textTransform: quoteAllCaps ? "uppercase" : "none",
  };

  return (
    <aside className="style-preview">
      <div className="style-preview-head">
        <span className="eyebrow">Live preview</span>
        <span className="muted small">Approximate. Use “Preview with real rendering” below to see the exact result.</span>
      </div>
      <div className="style-preview-card" style={{ background: "#ffffff", color: "#141e32" }}>
        <div className="style-preview-portrait" aria-hidden="true">
          <span>Portrait</span>
        </div>
        <div className="style-preview-section">
          <span className="style-preview-tag">Name</span>
          <div className="style-preview-text" style={nameStyle}>
            {nameAllCaps ? "AVERY BENNETT" : "Avery Bennett"}
          </div>
        </div>
        {!skipQuotes && (
          <div className="style-preview-section">
            <span className="style-preview-tag">Quote</span>
            <div className="style-preview-text" style={quoteStyle}>
              “The best way out is always through.”
            </div>
          </div>
        )}
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => void renderStrip()} disabled={!canRender || stripBusy}>
          {stripBusy ? "Rendering…" : "Preview with real rendering"}
        </button>
        {!canRender && <span className="muted small">Add your template and roster first.</span>}
        {stripError && <span role="alert" className="small">{stripError}</span>}
        {strip && (
          <figure style={{ margin: 0 }}>
            <img src={strip.url} alt="Real rendering of the first two students" style={{ maxWidth: "100%" }} data-testid="style-strip-image" />
            <figcaption className="muted small">Rendered by the output renderer, scaled down for preview.</figcaption>
            {strip.warnings.length > 0 && (
              <ul className="small" data-testid="style-strip-warnings">
                {strip.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </figure>
        )}
      </div>
    </aside>
  );
}

function FontLoader({
  availableFonts,
  setAvailableFonts,
  workspaceId,
  onFontFamily,
}: {
  availableFonts: { name: string; filename: string; source?: string }[];
  setAvailableFonts: (fonts: { name: string; filename: string; source?: string }[]) => void;
  workspaceId: string | null;
  onFontFamily: (v: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!workspaceId || !file) return;
    try {
      const filename = await uploadFont(workspaceId, file);
      setAvailableFonts([...availableFonts, { name: file.name, filename, source: "uploaded" }]);
      onFontFamily(filename);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="stack">
      <UploadDropLabel accept=".ttf,.otf" disabled={!workspaceId} onFile={(f) => setFile(f)}>
        <span>Upload custom font (.ttf/.otf)</span>
        <input type="file" accept=".ttf,.otf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </UploadDropLabel>
      <button onClick={handleUpload} disabled={!file || !workspaceId}>
        Upload font
      </button>
    </div>
  );
}
