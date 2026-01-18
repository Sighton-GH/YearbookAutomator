import { useState } from "react";
import type { Align, FontWeight } from "../types";
import { uploadFont } from "../api";
import { FontPick } from "../components/FontPick";
import { UploadDropLabel } from "../components/UploadDropLabel";

export function StylingStep({
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
    <div className="stack">
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

      <FontLoader
        availableFonts={availableFonts}
        setAvailableFonts={setAvailableFonts}
        workspaceId={workspaceId}
        onFontFamily={onNameFontFamily}
      />
    </div>
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
