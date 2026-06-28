import type React from "react";
import { useState } from "react";
import type { Align, FontWeight } from "../../types";
import { uploadFont } from "../../api";
import { FontPick } from "../../components/FontPick";
import { UploadDropLabel } from "../../components/UploadDropLabel";

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
  workspaceId,
  availableFonts,
  setAvailableFonts,
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
  workspaceId: string | null;
  availableFonts: { name: string; filename: string; source?: string }[];
  setAvailableFonts: (fonts: { name: string; filename: string; source?: string }[]) => void;
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

        <FontLoader availableFonts={availableFonts} setAvailableFonts={setAvailableFonts} workspaceId={workspaceId} onFontFamily={onNameFontFamily} />
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
}: {
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
  const nameStyle: React.CSSProperties = {
    fontFamily: nameFontFamily,
    fontSize: previewPx(nameFontSize),
    fontWeight: nameFontWeight === "bold" ? 700 : 400,
    textAlign: nameAlign,
    textTransform: nameAllCaps ? "uppercase" : "none",
  };
  const quoteStyle: React.CSSProperties = {
    fontFamily: quoteFontFamily,
    fontSize: previewPx(quoteFontSize),
    fontWeight: quoteFontWeight === "bold" ? 700 : 400,
    textAlign: quoteAlign,
    textTransform: quoteAllCaps ? "uppercase" : "none",
    fontStyle: "italic",
  };

  return (
    <aside className="style-preview">
      <div className="style-preview-head">
        <span className="eyebrow">Live preview</span>
        <span className="muted small">Approximate — final render uses your exact font &amp; size.</span>
      </div>
      <div className="style-preview-card">
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
