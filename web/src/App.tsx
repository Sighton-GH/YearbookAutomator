import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import Cropper, { type Area } from "react-easy-crop";
import { useLocation, useSearchParams } from "react-router-dom";
import { withBase } from "./baseUrl";
import {
  applyMapping,
  generateSpread,
  ingestSpreadsheet,
  parseTemplate,
  uploadImage,
  uploadBabyZip,
  uploadQuotesSpreadsheet,
  listFonts,
  uploadFont,
  assetUrl,
  babyMaskUrl,
  templateCleanUrl,
  templateAnnotatedUrl,
  generationDownloadUrl,
  generationDownloadAllUrl,
  generationDownloadSpreadsheetUrl,
  generationStatus,
  touchWorkspace,
  deleteWorkspace,
  startRemoveBackgroundPreviewJob,
  removeBackgroundPreviewStatus,
  fetchRemoveBackgroundPreviewResult,
  type Box,
  type PersonRecord,
  type TemplateSlots,
  type RawParseDebug
} from "./api";

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function formatEtaSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return "<5s";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins <= 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${String(remMins).padStart(2, "0")}m`;
}

async function cropToPngBlob(
  imageSrc: string,
  cropPixels: Area,
  outSize: { width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(outSize.width));
  canvas.height = Math.max(1, Math.floor(outSize.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Support crops that extend outside the image bounds (e.g. when zoomed out < 1
  // and the user drags freely). Out-of-bounds areas remain transparent.
  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  const sx = cropPixels.x;
  const sy = cropPixels.y;
  const sw = cropPixels.width;
  const sh = cropPixels.height;
  if (sw > 0 && sh > 0 && imgW > 0 && imgH > 0) {
    const ix0 = Math.max(0, sx);
    const iy0 = Math.max(0, sy);
    const ix1 = Math.min(imgW, sx + sw);
    const iy1 = Math.min(imgH, sy + sh);

    const iW = Math.max(0, ix1 - ix0);
    const iH = Math.max(0, iy1 - iy0);

    if (iW > 0 && iH > 0) {
      const dx = ((ix0 - sx) / sw) * canvas.width;
      const dy = ((iy0 - sy) / sh) * canvas.height;
      const dW = (iW / sw) * canvas.width;
      const dH = (iH / sh) * canvas.height;
      ctx.drawImage(image, ix0, iy0, iW, iH, dx, dy, dW, dH);
    }
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image blob"))), "image/png");
  });
  return blob;
}

function filesFromDataTransfer(dt: DataTransfer): File[] {
  if (dt.files && dt.files.length) return Array.from(dt.files);
  if (dt.items && dt.items.length) {
    return Array.from(dt.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
  }
  return [];
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return true;

  const fileName = file.name.toLowerCase();
  const fileType = (file.type || "").toLowerCase();

  return tokens.some((tokenRaw) => {
    const token = tokenRaw.toLowerCase();
    if (token === "*/*") return true;
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // keep trailing '/'
      return fileType.startsWith(prefix);
    }
    if (token.startsWith(".")) {
      return fileName.endsWith(token);
    }
    // exact mime
    return fileType === token;
  });
}

function scrollPastTopBar() {
  if (typeof window === "undefined") return;
  const topBar = document.querySelector(".ss-topbar") as HTMLElement | null;
  const topBarHeight = topBar?.offsetHeight ?? 0;
  const offset = topBarHeight + 8;

  // In the /tool page, the app is below the cover section. Scroll to the current step
  // (not the top of the whole page), then offset past the navbar.
  const anchor =
    (document.querySelector(".mapping-layout") as HTMLElement | null) ||
    (document.querySelector(".mapping-step") as HTMLElement | null) ||
    (document.querySelector(".panel") as HTMLElement | null);

  if (!anchor) {
    window.scrollTo({ top: offset, behavior: "smooth" });
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const targetTop = Math.max(0, window.scrollY + rect.top - offset);
  window.scrollTo({ top: targetTop, behavior: "smooth" });
}

function UploadDropLabel({
  accept,
  disabled,
  className,
  onFile,
  children,
}: {
  accept?: string;
  disabled?: boolean;
  className?: string;
  onFile: (file: File) => void;
  children: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const labelRef = useRef<HTMLLabelElement | null>(null);

  const setInputFileAndDispatch = (file: File): boolean => {
    const input = labelRef.current?.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      // In Chromium-based browsers, this is allowed when using a DataTransfer.
      // If it's blocked, we'll fall back to calling onFile directly.
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;

    const files = filesFromDataTransfer(e.dataTransfer);
    const firstAccepted = files.find((f) => matchesAccept(f, accept));
    if (!firstAccepted) return;

    // Prefer updating the underlying file input so the UI shows the filename
    // in the same place as a normal file picker selection.
    const dispatched = setInputFileAndDispatch(firstAccepted);
    if (!dispatched) onFile(firstAccepted);
  };

  return (
    <label
      className={clsx("upload", className, dragOver && "dragover", disabled && "disabled")}
      ref={labelRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      <span className="muted small">You can also drag and drop a file here.</span>
    </label>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  description,
  className,
  style,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <label className={clsx("switch", className)} style={style}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-ui" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span>{label}</span>
        {description ? <div className="muted small">{description}</div> : null}
      </span>
    </label>
  );
}

function groupSlotsByProximity(slots: TemplateSlots[], maxKeep?: number): TemplateSlots[] {
  if (slots.length <= 1) return [...slots].slice(0, maxKeep ?? slots.length);
  const centers = slots.map((slot, idx) => {
    const box = slot.mugshot;
    return {
      idx,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      span: (box.width + box.height) / 2,
    };
  });

  const avgSpan = centers.reduce((acc, c) => acc + c.span, 0) / centers.length;
  const threshold = avgSpan * 0.75;
  const remaining = [...centers];
  const groups: number[][] = [];

  const distance = (a: typeof centers[number], b: typeof centers[number]) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  };

  while (remaining.length) {
    const seed = remaining.shift()!;
    const group = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const candidate = remaining[i];
        const close = group.some((g) => distance(g, candidate) <= threshold);
        if (close) {
          group.push(candidate);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }
    groups.push(group.map((g) => g.idx));
  }

  const centerByIdx = new Map(centers.map((c) => [c.idx, c]));
  groups.sort((a, b) => {
    const ay = Math.min(...a.map((idx) => centerByIdx.get(idx)!.y));
    const by = Math.min(...b.map((idx) => centerByIdx.get(idx)!.y));
    if (ay !== by) return ay - by;
    const ax = Math.min(...a.map((idx) => centerByIdx.get(idx)!.x));
    const bx = Math.min(...b.map((idx) => centerByIdx.get(idx)!.x));
    return ax - bx;
  });

  const orderedIndices = groups.flatMap((group) =>
    [...group].sort((a, b) => {
      const ca = centerByIdx.get(a)!;
      const cb = centerByIdx.get(b)!;
      return ca.y === cb.y ? ca.x - cb.x : ca.y - cb.y;
    })
  );

  const ordered = orderedIndices.map((idx) => slots[idx]);
  const cap = typeof maxKeep === "number" ? Math.max(1, maxKeep) : ordered.length;
  return ordered.slice(0, cap);
}

const steps = [
  "Import Template",
  "Review Parsing",
  "Portraits",
  "Quotes",
  "Baby Photos",
  "Styling",
  "Review",
  "Results",
];

type AppProps = {
  embedded?: boolean;
};

type Align = "left" | "center";
type FontWeight = "normal" | "bold";
type PlacementMode = "simultaneous" | "left_then_right";

function computeSlotNumberToIndex(
  slots: TemplateSlots[],
  placementMode: PlacementMode,
  templateWidth: number | null | undefined,
): number[] {
  const identity = slots.map((_, i) => i);
  if (!slots.length) return identity;

  // For "simultaneous": the parse step already returns slots in correct reading order
  // across the full spread.
  if (placementMode === "simultaneous") return identity;

  // For "left_then_right": renumber slots so slot #1..#N fills the left page in reading
  // order, then the right page in reading order.
  const fallbackWidth = Math.max(1, ...slots.map((s) => s.mugshot.x + s.mugshot.width));
  const midX = (templateWidth ?? fallbackWidth) / 2;

  const heights = [...slots.map((s) => s.mugshot.height)].sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 1;
  const rowTol = Math.max(1, Math.round(medH * 0.6));

  type Item = { idx: number; cy: number; cx: number };

  const left: Item[] = [];
  const right: Item[] = [];
  slots.forEach((slot, idx) => {
    const b = slot.mugshot;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    (cx < midX ? left : right).push({ idx, cy, cx });
  });

  const orderSide = (items: Item[]): number[] => {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
    const rows: Item[][] = [];
    const rowCenters: number[] = [];
    for (const it of sorted) {
      if (!rows.length) {
        rows.push([it]);
        rowCenters.push(it.cy);
        continue;
      }
      const last = rowCenters[rowCenters.length - 1];
      if (Math.abs(it.cy - last) <= rowTol) {
        rows[rows.length - 1].push(it);
        const row = rows[rows.length - 1];
        rowCenters[rowCenters.length - 1] = row.reduce((sum, r) => sum + r.cy, 0) / row.length;
      } else {
        rows.push([it]);
        rowCenters.push(it.cy);
      }
    }

    const out: number[] = [];
    for (const row of rows) {
      row.sort((a, b) => a.cx - b.cx);
      out.push(...row.map((r) => r.idx));
    }
    return out;
  };

  return [...orderSide(left), ...orderSide(right)];
}

function comparePeopleByLastName(a: PersonRecord, b: PersonRecord): number {
  const normalize = (s: string | null | undefined) => (s ?? "").trim();

  const aLast = normalize(a.last_name);
  const bLast = normalize(b.last_name);
  const aLastEmpty = !aLast;
  const bLastEmpty = !bLast;
  if (aLastEmpty !== bLastEmpty) return aLastEmpty ? 1 : -1;

  // Full lexicographic compare (not first-letter only)
  const lastCmp = aLast.localeCompare(bLast, undefined, { sensitivity: "base" });
  if (lastCmp) return lastCmp;

  const aFirst = normalize(a.first_name);
  const bFirst = normalize(b.first_name);
  const firstCmp = aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
  if (firstCmp) return firstCmp;

  // Stable fallback: spreadsheet row index
  return (a.index ?? 0) - (b.index ?? 0);
}

function FontPick({
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

type PersistedSessionV1 = {
  v: 1;
  activeStep: number;
  workspaceId: string | null;
  templateId: string | null;
  skipQuotes?: boolean;
  skipBabyPhotos?: boolean;
  slots: TemplateSlots[];
  parsedSlots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
  people: PersonRecord[];
  slotAssignments: Record<number, number>;
  placementMode?: PlacementMode;
  forceAlphabetical?: boolean;
  defaultQuote: string;
  defaultBabyFilename: string | null;
  babyBackgroundColor?: string;
  defaultMugshotFilename?: string | null;
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
  peoplePerSpread: number;
};

const SESSION_KEY = "ymga.session.v1";

function parseStepFromSearch(search: string): number | null {
  try {
    const params = new URLSearchParams(search || "");
    const raw = (params.get("step") || "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    if (i < 0) return 0;
    if (i > 7) return 7;
    return i;
  } catch {
    return null;
  }
}

function tryLoadSession(): PersistedSessionV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function trySaveSession(session: PersistedSessionV1) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota / privacy mode
  }
}

function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export default function App({ embedded = false }: AppProps) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeStep, setActiveStep] = useState(0);
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const activeStepRef = useRef(0);
  activeStepRef.current = activeStep;
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [skipQuotes, setSkipQuotes] = useState(false);
  const [skipBabyPhotos, setSkipBabyPhotos] = useState(false);
  const [slots, setSlots] = useState<TemplateSlots[]>([]);
  const [templateSize, setTemplateSize] = useState<{ width: number; height: number } | null>(null);
  const [people, setPeople] = useState<PersonRecord[]>([]);

  const setPeopleSorted = (next: PersonRecord[]) => {
    // Preserve the user's chosen order. Alphabetical ordering (when desired)
    // is handled explicitly in the Review step / generation settings.
    setPeople(next);
  };

  const [slotAssignments, setSlotAssignments] = useState<Record<number, number>>({});
  const [defaultQuote, setDefaultQuote] = useState("404 quote not found");
  const [defaultBabyFilename, setDefaultBabyFilename] = useState<string | null>(null);
  const [babyBackgroundColor, setBabyBackgroundColor] = useState<string>("");
  const [defaultMugshotFilename, setDefaultMugshotFilename] = useState<string | null>(null);
  const [nameFontFamily, setNameFontFamily] = useState("Inter, system-ui, sans-serif");
  const [nameFontWeight, setNameFontWeight] = useState<FontWeight>("normal");
  const [nameFontSize, setNameFontSize] = useState<number>(40);
  const [nameAllCaps, setNameAllCaps] = useState(false);
  const [nameAlign, setNameAlign] = useState<Align>("left");

  const [quoteFontFamily, setQuoteFontFamily] = useState("Inter, system-ui, sans-serif");
  const [quoteFontWeight, setQuoteFontWeight] = useState<FontWeight>("normal");
  const [quoteFontSize, setQuoteFontSize] = useState<number>(40);
  const [quoteAllCaps, setQuoteAllCaps] = useState(false);
  const [quoteAlign, setQuoteAlign] = useState<Align>("left");
  const [availableFonts, setAvailableFonts] = useState<{ name: string; filename: string; source?: string }[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [outputPaths, setOutputPaths] = useState<string[]>([]);
  const [outputNonce, setOutputNonce] = useState(0);
  const [usageInfo, setUsageInfo] = useState<{ remaining: number; limit: number; period: "month" | "lifetime" } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [progress, setProgress] = useState(0);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState<string | null>(null);
  const [cleanPreviewUrl, setCleanPreviewUrl] = useState<string | null>(null);
  const [annotatedFile, setAnnotatedFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState<"clean" | "annotated">("clean");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [allowInsecureReviewResults, setAllowInsecureReviewResults] = useState(false);
  const [peoplePerSpread, setPeoplePerSpread] = useState<number>(16);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("left_then_right");
  const [forceAlphabetical, setForceAlphabetical] = useState(false);
  const [rawDebug, setRawDebug] = useState<RawParseDebug | null>(null);
  const [parsedSlots, setParsedSlots] = useState<TemplateSlots[]>([]);

  const defaultBabyUploadInFlight = useRef<Promise<string> | null>(null);
  const defaultMugshotUploadInFlight = useRef<Promise<string> | null>(null);

  const ensureDefaultBabyAbcBlocks = async (): Promise<string | null> => {
    if (!workspaceId) return null;
    if (defaultBabyFilename) return defaultBabyFilename;

    if (!defaultBabyUploadInFlight.current) {
      defaultBabyUploadInFlight.current = (async () => {
        const url = withBase("assets/Default_Baby_Photo_ABC_Blocks.webp");
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Could not load ${url}`);
        const blob = await resp.blob();
        const file = new File([blob], "default_baby_abc_blocks.webp", { type: "image/webp" });
        const filename = await uploadImage(workspaceId, "baby", file);
        setDefaultBabyFilename(filename);
        return filename;
      })();
    }

    try {
      return await defaultBabyUploadInFlight.current;
    } finally {
      defaultBabyUploadInFlight.current = null;
    }
  };

  const ensureDefaultMugshotEagle = async (): Promise<string | null> => {
    if (!workspaceId) return null;
    if (defaultMugshotFilename) return defaultMugshotFilename;

    if (!defaultMugshotUploadInFlight.current) {
      defaultMugshotUploadInFlight.current = (async () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");

        // Render the uploaded SVG to a PNG so the backend can treat it like any other portrait image.
        const svgUrl = withBase("assets/default_eagle.svg");
        const svgResp = await fetch(svgUrl);
        if (!svgResp.ok) throw new Error(`Could not load ${svgUrl}`);
        const svgText = await svgResp.text();

        const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
        const objectUrl = URL.createObjectURL(svgBlob);
        try {
          const img = new Image();
          img.decoding = "async";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Could not render default portrait SVG"));
            img.src = objectUrl;
          });

          ctx.clearRect(0, 0, size, size);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }

        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png");
        });
        const file = new File([blob], "default_eagle.png", { type: "image/png" });
        const filename = await uploadImage(workspaceId, "mugshot", file);
        setDefaultMugshotFilename(filename);
        return filename;
      })();
    }

    try {
      return await defaultMugshotUploadInFlight.current;
    } finally {
      defaultMugshotUploadInFlight.current = null;
    }
  };

  const confirmResetAll = () => {
    if (typeof window === "undefined") return true;
    return window.confirm("Reset everything in this workspace? This will clear parsed template, people, and settings.");
  };

  const requestResetAll = () => {
    if (!confirmResetAll()) return;
    handleReset();
  };

  const isStepSkipped = (stepIndex: number) => {
    if (stepIndex === 3) return skipQuotes;
    if (stepIndex === 4) return skipBabyPhotos;
    return false;
  };

  const stepReady = (stepIndex: number) => {
    if (stepIndex <= 0) return true;
    if (stepIndex === 1) return Boolean(workspaceId && slots.length);
    if (stepIndex === 2) return Boolean(workspaceId && slots.length);
    if (stepIndex === 3) return people.length > 0;
    if (stepIndex === 4) return people.length > 0;
    if (stepIndex === 5) return people.length > 0;
    if (stepIndex === 6) return Boolean(people.length && slots.length);
    if (stepIndex === 7) return Boolean(workspaceId && (outputPaths.length > 0 || outputPath));
    return true;
  };

  const goToStep = (target: number) => {
    if (loading) {
      setStatus("Please wait for the current operation to finish");
      return;
    }
    if (isStepSkipped(target)) {
      setStatus("That step is currently skipped (change this in Import Template)");
      return;
    }
    if (!stepReady(target)) {
      setStatus("Complete the previous steps before jumping ahead");
      return;
    }
    setActiveStep(target);
  };

  const handleReset = () => {
    const toDelete = workspaceId;
    if (toDelete) {
      void deleteWorkspace(toDelete).catch(() => {
        // best-effort; janitor/TTL still cleans up
      });
    }
    if (annotatedPreviewUrl) URL.revokeObjectURL(annotatedPreviewUrl);
    if (cleanPreviewUrl) URL.revokeObjectURL(cleanPreviewUrl);
    setWorkspaceId(null);
    setTemplateId(null);
    setSkipQuotes(false);
    setSkipBabyPhotos(false);
    setSlots([]);
    setParsedSlots([]);
    setTemplateSize(null);
    setPeople([]);
    setSlotAssignments({});
    setDefaultQuote("404 quote not found");
    setDefaultBabyFilename(null);
    setBabyBackgroundColor("");
    setDefaultMugshotFilename(null);
    setNameFontFamily("Inter, system-ui, sans-serif");
    setNameFontWeight("normal");
    setNameFontSize(40);
    setNameAllCaps(false);
    setNameAlign("left");
    setQuoteFontFamily("Inter, system-ui, sans-serif");
    setQuoteFontWeight("normal");
    setQuoteFontSize(40);
    setQuoteAllCaps(false);
    setQuoteAlign("left");
    setStatus("");
    setLoading(false);
    setOutputPath(null);
    setOutputPaths([]);
    setOutputNonce(0);
    setPreviewPath(null);
    setPreviewNonce(0);
    setProgress(0);
    setTemplatePreviewUrl(null);
    setAnnotatedPreviewUrl(null);
    setCleanPreviewUrl(null);
    setAnnotatedFile(null);
    setCleanFile(null);
    setPreviewMode("clean");
    setSelectedSlot(null);
    setSwapMode(false);
    setPeoplePerSpread(16);
    setPlacementMode("left_then_right");
    setForceAlphabetical(false);
    clearSession();
  };

  // Keep the server workspace marked as active while this tab is open.
  // Also request end-session cleanup on tab close, with a grace window to avoid
  // deleting on quick reloads (the new tab load will 'touch' again).
  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;
    const ping = async () => {
      if (canceled) return;
      try {
        await touchWorkspace(workspaceId);
      } catch {
        // ignore; server might be down or user is offline
      }
    };

    void ping();
    const interval = window.setInterval(() => {
      void ping();
    }, 20_000);

    const requestEndSession = () => {
      try {
        const form = new FormData();
        form.append("workspace_id", workspaceId);
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon("/api/workspaces/end-session", form);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("pagehide", requestEndSession);
    window.addEventListener("beforeunload", requestEndSession);

    return () => {
      canceled = true;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", requestEndSession);
      window.removeEventListener("beforeunload", requestEndSession);
    };
  }, [workspaceId]);

  // Restore persisted session (workspace + state) so users can resume without reuploading.
  useEffect(() => {
    try {
      const saved = tryLoadSession();

      // Only auto-restore when starting fresh (avoid clobbering in-flight UI state).
      if (saved && !(workspaceId || templateId || people.length || slots.length)) {
        // Allow deep-linking: if /tool?step=N is present, prefer that over the saved step.
        const urlStep =
          typeof window !== "undefined" && window.location.pathname === "/tool"
            ? parseStepFromSearch(window.location.search)
            : null;

        setActiveStep(Math.max(0, Math.min(7, urlStep ?? (saved.activeStep ?? 0))));
        setWorkspaceId(saved.workspaceId);
        setTemplateId(saved.templateId);
        setSkipQuotes(Boolean(saved.skipQuotes));
        setSkipBabyPhotos(Boolean(saved.skipBabyPhotos));
        setSlots(saved.slots ?? []);
        setParsedSlots(saved.parsedSlots ?? []);
        setTemplateSize(saved.templateSize ?? null);
        setPeople(saved.people ?? []);
        setSlotAssignments(saved.slotAssignments ?? {});
        setPlacementMode((saved.placementMode as PlacementMode) ?? "left_then_right");
        setForceAlphabetical(Boolean(saved.forceAlphabetical));
        setDefaultQuote(saved.defaultQuote ?? "404 quote not found");
        setDefaultBabyFilename(saved.defaultBabyFilename ?? null);
        setBabyBackgroundColor(saved.babyBackgroundColor ?? "");
        setDefaultMugshotFilename(saved.defaultMugshotFilename ?? null);
        setNameFontFamily(saved.nameFontFamily ?? "Inter, system-ui, sans-serif");
        setNameFontWeight((saved.nameFontWeight as FontWeight) ?? "normal");
        setNameFontSize(typeof saved.nameFontSize === "number" ? saved.nameFontSize : 40);
        setNameAllCaps(Boolean(saved.nameAllCaps));
        setNameAlign((saved.nameAlign as Align) ?? "left");
        setQuoteFontFamily(saved.quoteFontFamily ?? "Inter, system-ui, sans-serif");
        setQuoteFontWeight((saved.quoteFontWeight as FontWeight) ?? "normal");
        setQuoteFontSize(typeof saved.quoteFontSize === "number" ? saved.quoteFontSize : 40);
        setQuoteAllCaps(Boolean(saved.quoteAllCaps));
        setQuoteAlign((saved.quoteAlign as Align) ?? "left");
        setPeoplePerSpread(typeof saved.peoplePerSpread === "number" ? saved.peoplePerSpread : 16);

        if (saved.workspaceId) {
          // Use server-stored template for preview after refresh.
          setTemplatePreviewUrl(`${templateCleanUrl(saved.workspaceId)}&t=${Date.now()}`);
          setAnnotatedPreviewUrl(`${templateAnnotatedUrl(saved.workspaceId)}&t=${Date.now()}`);
          setCleanPreviewUrl(`${templateCleanUrl(saved.workspaceId)}&t=${Date.now()}`);
        }
      }
    } finally {
      setDidRestoreSession(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL -> state: allow /tool?step=N to jump to a step (and restore after navigating back).
  useEffect(() => {
    if (!didRestoreSession) return;
    if (location.pathname !== "/tool") return;

    const urlStep = parseStepFromSearch(location.search);
    if (urlStep == null) return;
    if (urlStep === activeStepRef.current) return;
    goToStep(urlStep);
  }, [didRestoreSession, location.pathname, location.search]);

  // State -> URL: keep ?step= in sync (without spamming history).
  useEffect(() => {
    if (location.pathname !== "/tool") return;
    const current = parseStepFromSearch(location.search);
    if (current === activeStep) return;

    const next = new URLSearchParams(searchParams);
    next.set("step", String(activeStep));
    setSearchParams(next, { replace: true });
  }, [location.pathname, location.search, activeStep, searchParams, setSearchParams]);

  // Persist session as the user progresses.
  useEffect(() => {
    const payload: PersistedSessionV1 = {
      v: 1,
      activeStep,
      workspaceId,
      templateId,
      skipQuotes,
      skipBabyPhotos,
      slots,
      parsedSlots,
      templateSize,
      people,
      slotAssignments,
      placementMode,
      forceAlphabetical,
      defaultQuote,
      defaultBabyFilename,
      babyBackgroundColor,
      defaultMugshotFilename,
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
      peoplePerSpread,
    };
    trySaveSession(payload);
  }, [
    activeStep,
    workspaceId,
    templateId,
    skipQuotes,
    skipBabyPhotos,
    slots,
    parsedSlots,
    templateSize,
    people,
    slotAssignments,
    placementMode,
    forceAlphabetical,
    defaultQuote,
    defaultBabyFilename,
    babyBackgroundColor,
    defaultMugshotFilename,
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
    peoplePerSpread,
  ]);

  // If the user enables skipping while currently on that step, jump ahead.
  useEffect(() => {
    if (activeStep === 3 && skipQuotes) {
      setActiveStep(skipBabyPhotos ? 5 : 4);
      return;
    }
    if (activeStep === 4 && skipBabyPhotos) {
      setActiveStep(5);
    }
  }, [activeStep, skipQuotes, skipBabyPhotos]);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        const resp = await listFonts(workspaceId || undefined);
        const merged = [...resp.system.map((f) => ({ ...f, source: "system" })), ...resp.uploaded.map((f) => ({ ...f, source: "uploaded" }))];
        setAvailableFonts(merged);
      } catch (err) {
        console.error(err);
      }
    };
    loadFonts();
  }, [workspaceId]);

  const updateAnnotatedFile = (file: File | null) => {
    if (annotatedPreviewUrl) URL.revokeObjectURL(annotatedPreviewUrl);
    setAnnotatedFile(file);
    setAnnotatedPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const updateCleanFile = (file: File | null) => {
    if (cleanPreviewUrl) URL.revokeObjectURL(cleanPreviewUrl);
    setCleanFile(file);
    setCleanPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const canContinue = useMemo(() => {
    if (activeStep === 0) return Boolean(workspaceId && slots.length);
    if (activeStep === 1) return Boolean(slots.length);
    if (activeStep === 2) return people.length > 0;
    if (activeStep === 6) return Boolean(people.length && slots.length);
    if (activeStep === 7) return Boolean(outputPaths.length > 0 || outputPath);
    return true;
  }, [activeStep, workspaceId, slots, people, outputPaths.length, outputPath]);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const renderFailedMessage = useMemo(() => {
    const s = (status || "").trim();
    if (!s) return null;
    if (s.startsWith("Generation failed:")) return s;
    if (s === "Generation failed") return s;
    if (s.startsWith("Preview generation failed")) return s;
    if (s === "Generation polling failed") return s;
    return null;
  }, [status]);

  const slotNumberToIndex = useMemo(() => {
    return computeSlotNumberToIndex(slots, placementMode, templateSize?.width);
  }, [slots, placementMode, templateSize?.width]);

  useEffect(() => {
    if (forceAlphabetical) setSwapMode(false);
  }, [forceAlphabetical]);

  const getPeopleForGeneration = (list: PersonRecord[]) => {
    return forceAlphabetical ? [...list].sort(comparePeopleByLastName) : list;
  };

  const buildSlotsForPeople = (peopleList: PersonRecord[]) => {
    // IMPORTANT:
    // - `PersonRecord.index` is a spreadsheet row index (1..N).
    // - Slot positions are 1-based within a spread.
    // Default assignments must be based on the person's position in the *current list*
    // (e.g., spread chunk), not the spreadsheet index, otherwise everyone past the
    // slot count falls back to slot 1.
    return peopleList.map((p, i) => {
      const defaultSlotNumber = i + 1;
      const assignedSlotNumber = slotAssignments[p.index] ?? defaultSlotNumber;
      const logicalIdx = assignedSlotNumber - 1;
      const actualIdx = slotNumberToIndex[logicalIdx] ?? slotNumberToIndex[0] ?? 0;
      return slots[actualIdx] ?? slots[0];
    });
  };

  const runGeneration = async (opts: {
    outputFilename?: string;
    peopleOverride?: PersonRecord[];
    onDone?: (output: string) => void;
    statusLabel?: string;
    spreadIndex?: number; // 1-based
    totalSpreads?: number;
    overallStartMs?: number;
    countUsage?: boolean;
  }): Promise<string | null> => {
    if (!workspaceId || !templateId) return null;
    setProgress(0);
    setLoading(true);
    const baseLabel = opts.spreadIndex && opts.totalSpreads
      ? `Rendering spread ${opts.spreadIndex}/${opts.totalSpreads}...`
      : (opts.statusLabel || (opts.outputFilename ? "Generating preview..." : "Generating spread..."));
    setStatus(baseLabel);
    try {
      const ensuredDefaultMugshot = await ensureDefaultMugshotEagle();
      const ensuredDefaultBaby = skipBabyPhotos ? undefined : ((await ensureDefaultBabyAbcBlocks()) ?? undefined);
      const peopleInput = opts.peopleOverride ?? people;
      const peopleToSend = peopleInput.map((p) => ({
        ...p,
        quote: skipQuotes ? null : p.quote,
        baby_photo_filename: skipBabyPhotos ? null : p.baby_photo_filename,
      }));
      const gen = await generateSpread({
        workspace_id: workspaceId,
        template_id: templateId,
        slots,
        people: peopleToSend,
        count_usage: Boolean(opts.countUsage),
        auto_place: true,
        placement_mode: placementMode,
        force_alphabetical: forceAlphabetical,
        slot_assignments: slotAssignments,
        output_filename: opts.outputFilename,
        default_quote: skipQuotes ? undefined : defaultQuote,
        default_mugshot_filename: ensuredDefaultMugshot,
        default_baby_photo_filename: skipBabyPhotos ? undefined : ensuredDefaultBaby,
        // Legacy fields (kept for backwards compatibility)
        font_family: nameFontFamily,
        font_weight: nameFontWeight,
        all_caps: nameAllCaps,
        align: nameAlign,
        // Preferred: separate name/quote styles
        name_font_family: nameFontFamily,
        name_font_weight: nameFontWeight,
        name_font_size: nameFontSize,
        name_all_caps: nameAllCaps,
        name_align: nameAlign,
        quote_font_family: quoteFontFamily,
        quote_font_weight: quoteFontWeight,
        quote_font_size: quoteFontSize,
        quote_all_caps: quoteAllCaps,
        quote_align: quoteAlign,
        baby_background_color: skipBabyPhotos ? undefined : (babyBackgroundColor.trim() ? babyBackgroundColor.trim() : undefined),
      });

      const jobId = gen.jobId;
      if (opts.countUsage && gen.usage) setUsageInfo(gen.usage);

      const jobStartMs = performance.now();

      while (true) {
        try {
          const statusResp = await generationStatus(jobId);

          const spreadPct = typeof statusResp.progress === "number" ? Math.max(0, Math.min(100, statusResp.progress)) : 0;
          const hasMulti = Boolean(opts.spreadIndex && opts.totalSpreads && typeof opts.overallStartMs === "number");

          // Progress bar: overall for multi-spread renders, per-spread otherwise.
          if (hasMulti) {
            const doneSpreads = Math.max(0, (opts.spreadIndex ?? 1) - 1);
            const totalSpreads = Math.max(1, opts.totalSpreads ?? 1);
            const overallFrac = Math.max(0, Math.min(1, (doneSpreads + spreadPct / 100) / totalSpreads));
            setProgress(Math.round(overallFrac * 100));
          } else {
            setProgress(Math.round(spreadPct));
          }

          // ETA: overall if multi-spread; otherwise per-job ETA from current progress.
          let etaSeconds: number | null = null;
          if (hasMulti) {
            const elapsed = Math.max(0, (performance.now() - (opts.overallStartMs ?? jobStartMs)) / 1000);
            const doneSpreads = Math.max(0, (opts.spreadIndex ?? 1) - 1);
            const totalSpreads = Math.max(1, opts.totalSpreads ?? 1);
            const overallFrac = Math.max(0, Math.min(1, (doneSpreads + spreadPct / 100) / totalSpreads));
            if (overallFrac >= 0.02) etaSeconds = (elapsed * (1 - overallFrac)) / overallFrac;
          } else {
            const elapsed = Math.max(0, (performance.now() - jobStartMs) / 1000);
            if (spreadPct >= 2) etaSeconds = (elapsed * (100 - spreadPct)) / spreadPct;
          }

          const detail = statusResp.status || "";
          const parts: string[] = [];
          if (opts.spreadIndex && opts.totalSpreads) {
            parts.push(`Spread ${opts.spreadIndex}/${opts.totalSpreads}`);
          } else {
            parts.push(baseLabel.replace(/\.{3}$/, ""));
          }
          if (detail) parts.push(detail);
          if (opts.spreadIndex && opts.totalSpreads) {
            parts.push(`Spread ${Math.round(spreadPct)}%`);
            if (typeof opts.overallStartMs === "number") {
              const doneSpreads = Math.max(0, (opts.spreadIndex ?? 1) - 1);
              const totalSpreads = Math.max(1, opts.totalSpreads ?? 1);
              const overallFrac = Math.max(0, Math.min(1, (doneSpreads + spreadPct / 100) / totalSpreads));
              parts.push(`Overall ${Math.round(overallFrac * 100)}%`);
            }
          }
          if (etaSeconds !== null) parts.push(`ETA ${formatEtaSeconds(etaSeconds)}`);
          setStatus(parts.join(" — "));

          if (statusResp.error) {
            setStatus(`Generation failed: ${statusResp.error}`);
            setLoading(false);
            return null;
          }
          if (statusResp.output) {
            opts.onDone?.(statusResp.output);
            setStatus(opts.outputFilename ? "Preview ready" : "Generation complete");
            setProgress(100);
            setLoading(false);
            return statusResp.output;
          }
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          console.error(err);
          setStatus("Generation polling failed");
          setLoading(false);
          return null;
        }
      }

      // Unreachable, but keeps TS happy about return type.
      return null;
    } catch (err) {
      setStatus(opts.outputFilename ? "Preview generation failed" : "Generation failed");
      console.error(err);
      setLoading(false);
      return null;
    }
  };

  const handleRenderPreview = async () => {
    if (!workspaceId || !templateId) return;
    const count = Math.min(slots.length || people.length, people.length);
    const previewPeople = getPeopleForGeneration(people).slice(0, count);
    await runGeneration({
      outputFilename: "preview.png",
      peopleOverride: previewPeople,
      onDone: (out) => {
        setPreviewPath(out);
        setPreviewNonce((n) => n + 1);
      }
    });
  };

  const handleRenderAll = async () => {
    if (!workspaceId || !templateId) return;
    if (!slots.length || !people.length) return;

    setUsageInfo(null);

    const peopleForAll = getPeopleForGeneration(people);

    // Render multiple spreads by chunking `people` and generating one PNG per chunk.
    // We clamp to the number of detected template slots to avoid overwriting the same
    // slot positions within a single image.
    const perSpread = Math.max(1, Math.min(peoplePerSpread || 1, slots.length));
    const totalSpreads = Math.max(1, Math.ceil(peopleForAll.length / perSpread));
    const outputs: string[] = [];
    setOutputPaths([]);
    setOutputPath(null);

    const overallStartMs = performance.now();

    for (let spreadIdx = 0; spreadIdx < totalSpreads; spreadIdx++) {
      const start = spreadIdx * perSpread;
      const end = Math.min(peopleForAll.length, start + perSpread);
      const spreadPeople = peopleForAll.slice(start, end);
      const filename = `output_${String(spreadIdx + 1).padStart(2, "0")}.png`;
      const out = await runGeneration({
        outputFilename: filename,
        peopleOverride: spreadPeople,
        spreadIndex: spreadIdx + 1,
        totalSpreads,
        overallStartMs,
        countUsage: spreadIdx === 0,
      });
      if (!out) return;
      outputs.push(out);
      setOutputPaths([...outputs]);
    }

    setOutputPath(outputs[0] || null);
    setOutputNonce((n) => n + 1);
    setActiveStep(7);
  };

  useEffect(() => {
    if (activeStep !== 6) return;
    if (!workspaceId || !templateId) return;
    if (!people.length || !slots.length) return;
    if (loading) return;
    if (previewPath) return;
    // Auto-render the one-page preview the first time you reach Review & generate.
    handleRenderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, workspaceId, templateId, people.length, slots.length]);

  const stepsForNav = useMemo(() => {
    return steps.map((label, idx) => (isStepSkipped(idx) ? `${label} (skipped)` : label));
  }, [skipQuotes, skipBabyPhotos]);

  const stepsNav = (
    <div className={clsx("steps", embedded && "fullwidth")} aria-label="Tool steps">
      {stepsForNav.map((step, idx) => (
        <div
          key={step}
          className={clsx("step", { active: idx === activeStep, disabled: !stepReady(idx) || loading })}
          role="button"
          tabIndex={0}
          onClick={() => goToStep(idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goToStep(idx);
            }
          }}
          aria-disabled={!stepReady(idx) || loading}
          title={
            isStepSkipped(idx)
              ? "Skipped (change this in Import Template)"
              : !stepReady(idx)
                ? "Complete earlier steps first"
                : loading
                  ? "Busy"
                  : "Go to step"
          }
        >
          <span className="badge">{idx + 1}</span>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {embedded ? (
        <section className="ss-steps">
          <div className="ss-steps-inner">{stepsNav}</div>
        </section>
      ) : (
        <div className="page">
          <header className="topbar">
            <div>
              <h1>Custom Yearbook Spread Automator</h1>
              <p className="muted">Developed by Sighton Innovations — local-first, ready to host later.</p>
            </div>
            {stepsNav}
          </header>
        </div>
      )}

      <div className="page">

      {activeStep !== 7 && renderFailedMessage && (
        <div className="panel" role="alert" aria-live="assertive" style={{ marginBottom: 16 }}>
          <div className="inline" style={{ gap: 10 }}>
            <span aria-hidden="true">🛑</span>
            <div>
              <strong>{renderFailedMessage}</strong>
            </div>
          </div>
        </div>
      )}

      <main
        className={clsx("layout", {
          "layout-single":
            activeStep === 0 ||
            activeStep === 1 ||
            activeStep === 2 ||
            activeStep === 3 ||
            activeStep === 4 ||
            activeStep === 5 ||
            activeStep === 6 ||
            activeStep === 7,
        })}
      >
        {activeStep !== 1 && activeStep !== 2 && activeStep !== 3 && activeStep !== 4 && (
          <section className="panel">
          {activeStep === 6 || activeStep === 7 ? (
            <div className="section-header">
              <div className="stack" style={{ gap: 4 }}>
                <h2>{steps[activeStep]}</h2>
                {activeStep === 6 && insecureHttp && (
                  <div className="callout warn">
                    <div className="stack" style={{ gap: 8 }}>
                      <strong>
                        <span className="warn-icon" aria-hidden="true">⚠</span>
                        Warning: Unencrypted results (HTTP)
                      </strong>
                      <div className="muted small">
                        You are not on HTTPS. Results are not encrypted in transit and may be visible to others on the network.
                        Use HTTPS or run on localhost if possible.
                      </div>
                      <ToggleSwitch
                        checked={allowInsecureReviewResults}
                        onChange={setAllowInsecureReviewResults}
                        label="I understand (show results over HTTP)"
                      />
                    </div>
                  </div>
                )}
                {activeStep === 6 ? (
                  <p className="muted">Preview one page, confirm people, then render all.</p>
                ) : (
                  <p className="muted">Results from the latest render.</p>
                )}
                {activeStep === 6 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {status && !renderFailedMessage && <p className="muted">{status}</p>}
                    {loading && progress > 0 && <ProgressBar progress={progress} />}
                  </div>
                )}
              </div>
              <div className="section-actions">
                <button disabled={loading} onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
                  Back
                </button>
                {activeStep === 6 ? (
                  <button className="primary" disabled={loading || !canContinue} onClick={handleRenderAll}>
                    {loading ? "Rendering..." : "Render all"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <h2>{steps[activeStep]}</h2>
          )}
          {activeStep === 0 && (
            <TemplateParsing
              workspaceId={workspaceId}
              onParsed={(resp) => {
                setWorkspaceId(resp.template_id);
                setTemplateId(resp.template_id);
                setSlots(resp.slots);
                setParsedSlots(resp.slots.map(s => ({ ...s })));
                setTemplateSize({ width: resp.width, height: resp.height });
                setTemplatePreviewUrl(`${templateCleanUrl(resp.template_id)}&t=${Date.now()}`);
                setActiveStep(1);
              }}
              skipQuotes={skipQuotes}
              onSkipQuotes={setSkipQuotes}
              skipBabyPhotos={skipBabyPhotos}
              onSkipBabyPhotos={setSkipBabyPhotos}
              setStatus={setStatus}
              setLoading={setLoading}
              loading={loading}
              annotated={annotatedFile}
              clean={cleanFile}
              annotatedPreview={annotatedPreviewUrl}
              cleanPreview={cleanPreviewUrl}
              onAnnotatedChange={updateAnnotatedFile}
              onCleanChange={updateCleanFile}
              peoplePerSpread={peoplePerSpread}
              setPeoplePerSpread={setPeoplePerSpread}
              onPreviewChange={({ annotated, clean }) => {
                setAnnotatedPreviewUrl(annotated ?? null);
                setCleanPreviewUrl(clean ?? null);
                setTemplatePreviewUrl(clean ?? annotated ?? null);
              }}
              onRawDebug={setRawDebug}
            />
          )}
          {activeStep === 5 && (
            <Styling
              nameFontFamily={nameFontFamily}
              nameFontWeight={nameFontWeight}
              nameFontSize={nameFontSize}
              nameAllCaps={nameAllCaps}
              nameAlign={nameAlign}
              onNameFontFamily={setNameFontFamily}
              onNameFontWeight={setNameFontWeight}
              onNameFontSize={setNameFontSize}
              onNameAllCaps={setNameAllCaps}
              onNameAlign={setNameAlign}
              quoteFontFamily={quoteFontFamily}
              quoteFontWeight={quoteFontWeight}
              quoteFontSize={quoteFontSize}
              quoteAllCaps={quoteAllCaps}
              quoteAlign={quoteAlign}
              onQuoteFontFamily={setQuoteFontFamily}
              onQuoteFontWeight={setQuoteFontWeight}
              onQuoteFontSize={setQuoteFontSize}
              onQuoteAllCaps={setQuoteAllCaps}
              onQuoteAlign={setQuoteAlign}
              workspaceId={workspaceId}
              availableFonts={availableFonts}
              setAvailableFonts={setAvailableFonts}
            />
          )}
          {activeStep === 6 && (
            <>
            {insecureHttp && !allowInsecureReviewResults ? (
              <p className="muted">Enable the toggle above to view results over HTTP.</p>
            ) : (
              <div className="stack">
              <div className="callout">
                <div className="stack" style={{ gap: 8 }}>
                  <strong>Stats</strong>
                  <div className="grid two">
                    <div>
                      <div className="muted small">Estimated spreads</div>
                      <div>
                        {peoplePerSpread > 0 ? Math.max(1, Math.ceil(people.length / peoplePerSpread)) : "—"}
                        <span className="muted small"> (at {peoplePerSpread} students/spread)</span>
                      </div>
                    </div>
                    <div>
                      <div className="muted small">Total students</div>
                      <div>{people.length}</div>
                    </div>
                    <div>
                      <div className="muted small">Without portrait</div>
                      <div>{people.filter((p) => !p.mugshot_filename).length}</div>
                    </div>
                    <div>
                      <div className="muted small">Without custom baby photo</div>
                      <div>{people.filter((p) => !p.baby_photo_filename).length}</div>
                    </div>
                    <div>
                      <div className="muted small">Without custom quote</div>
                      <div>{people.filter((p) => !p.quote || !p.quote.trim()).length}</div>
                    </div>
                    <div>
                      <div className="muted small">Missing any of the above</div>
                      <div>
                        {
                          people.filter(
                            (p) =>
                              !p.mugshot_filename ||
                              !p.baby_photo_filename ||
                              !p.quote ||
                              !p.quote.trim()
                          ).length
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
                        onChange={() => setPlacementMode("simultaneous")}
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
                        onChange={() => setPlacementMode("left_then_right")}
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
                        onChange={(e) => setForceAlphabetical(e.target.checked)}
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
                          window.open(
                            generationDownloadUrl(workspaceId, fname),
                            "_blank"
                          );
                        }}
                      >
                        Download preview
                      </button>
                    )}
                  </div>

                  {workspaceId && (
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="muted small">Rendered preview image:</div>
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
                    </div>
                  )}
                </div>
              </div>

              <Review
                people={people}
                workspaceId={workspaceId}
                babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
                defaultBabyFilename={defaultBabyFilename}
                defaultQuote={defaultQuote}
                perSpread={Math.max(1, Math.min(peoplePerSpread || 1, slots.length || 1))}
                swapMode={swapMode}
                swapDisabled={forceAlphabetical}
                onToggleSwapMode={() => setSwapMode((v) => !v)}
                onSwapPositions={(a, b) => {
                  setPeople((prev) => {
                    if (a === b) return prev;
                    if (a < 0 || b < 0 || a >= prev.length || b >= prev.length) return prev;
                    const next = [...prev];
                    const tmp = next[a];
                    next[a] = next[b];
                    next[b] = tmp;
                    return next;
                  });
                  setSlotAssignments({});
                }}
              />
              </div>
            )}
            </>
          )}
          {activeStep === 7 && (
            <Results
              outputPath={outputPath}
              outputPaths={outputPaths}
              workspaceId={workspaceId}
              outputNonce={outputNonce}
              usageInfo={usageInfo}
            />
          )}
          {activeStep !== 1 && activeStep !== 6 && activeStep !== 7 && (
            <div className="actions">
              <button
                disabled={activeStep === 0}
                onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
              <button type="button" className="danger" onClick={requestResetAll} disabled={loading}>
                Reset all
              </button>
              {activeStep < steps.length - 1 ? (
                <button
                  className="primary"
                  disabled={!canContinue || loading}
                  onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
                >
                  Continue
                </button>
              ) : (
                <button className="primary" disabled={loading || !canContinue} onClick={handleRenderAll}>
                  {loading ? "Rendering..." : "Render all"}
                </button>
              )}
              {activeStep === 0 && (
                <span className="muted small">Live preview is on the next step.</span>
              )}
            </div>
          )}
          {activeStep !== 6 && activeStep !== 7 && status && !renderFailedMessage && <p className="muted">{status}</p>}
          {activeStep !== 6 && activeStep !== 7 && loading && progress > 0 && <ProgressBar progress={progress} />}
          </section>
        )}

        {activeStep === 2 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <MugshotMapping
              workspaceId={workspaceId}
              defaultMugshotFilename={defaultMugshotFilename}
              onDefaultMugshotFilename={setDefaultMugshotFilename}
              ensureDefaultMugshotEagle={ensureDefaultMugshotEagle}
              onMapped={setPeople}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              loading={loading}
              people={people}
              setPeople={setPeople}
              status={status}
              progress={progress}
              canContinue={canContinue}
              onBack={() => setActiveStep(1)}
              onReset={requestResetAll}
              onContinue={() => setActiveStep(skipQuotes ? (skipBabyPhotos ? 5 : 4) : 3)}
            />
          </section>
        )}

        {activeStep === 3 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <QuotesStep
              defaultQuote={defaultQuote}
              onDefaultQuote={setDefaultQuote}
              workspaceId={workspaceId}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              people={people}
              setPeople={setPeople}
              loading={loading}
              status={status}
              progress={progress}
              canContinue={canContinue}
              onBack={() => setActiveStep(2)}
              onReset={requestResetAll}
              onContinue={() => setActiveStep(skipBabyPhotos ? 5 : 4)}
            />
          </section>
        )}

        {activeStep === 4 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <BabyPhotosStep
              workspaceId={workspaceId}
              babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
              defaultBabyFilename={defaultBabyFilename}
              defaultQuote={defaultQuote}
              onDefaultBabyFilename={setDefaultBabyFilename}
              babyBackgroundColor={babyBackgroundColor}
              onBabyBackgroundColor={setBabyBackgroundColor}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              people={people}
              setPeople={setPeople}
              loading={loading}
              status={status}
              progress={progress}
              canContinue={canContinue}
              onBack={() => setActiveStep(3)}
              onReset={requestResetAll}
              onContinue={() => setActiveStep(5)}
            />
          </section>
        )}

        {activeStep === 1 && (
          <section className="panel preview full-preview">
            <div className="section-header">
              <div className="stack">
                <h3>Parsing review</h3>
                <p className="muted">Review detected slots. Drag to tweak boxes, regroup, then continue.</p>
              </div>
              <div className="section-actions">
                <button onClick={() => setActiveStep(0)}>Back</button>
                <button type="button" className="danger" onClick={requestResetAll} disabled={loading}>Reset all</button>
                <button className="primary" disabled={!slots.length || loading} onClick={() => setActiveStep(2)}>Continue</button>
              </div>
            </div>
            <div className="preview-grid">
              <div className="preview-left">
                <TemplatePreview
                  slots={slots}
                  size={templateSize}
                  onUpdate={setSlots}
                  backgroundUrl={previewMode === "annotated" ? annotatedPreviewUrl ?? templatePreviewUrl : cleanPreviewUrl ?? templatePreviewUrl}
                  selectedSlot={selectedSlot}
                  onSelectSlot={setSelectedSlot}
                />
                <div className="preview-toggle">
                  <button
                    type="button"
                    className={clsx("chip", { active: previewMode === "clean" })}
                    onClick={() => setPreviewMode("clean")}
                    disabled={!cleanPreviewUrl && !templatePreviewUrl}
                  >
                    Show clean template
                  </button>
                  <button
                    type="button"
                    className={clsx("chip", { active: previewMode === "annotated" })}
                    onClick={() => setPreviewMode("annotated")}
                    disabled={!annotatedPreviewUrl && !templatePreviewUrl}
                  >
                    Show annotated template
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setSlots((current) => groupSlotsByProximity(current, peoplePerSpread))}
                    disabled={!slots.length}
                  >
                    Regroup nearby slots
                  </button>
                </div>
              </div>
              <div className="preview-right">
                <SlotEditor
                  slots={slots}
                  onChange={setSlots}
                  onSelectSlot={setSelectedSlot}
                  selectedSlot={selectedSlot}
                  parsedSlots={parsedSlots}
                  onResetToParsed={() => setSlots(parsedSlots.map(s => ({ ...s })))}
                />
              </div>
            </div>
            {rawDebug && (
              <div className="debug-section">
                <details>
                  <summary className="muted small">
                    Debug: {rawDebug.mugshot_count} portraits, {rawDebug.baby_count} baby, {rawDebug.name_count} names, {rawDebug.quote_count} quotes
                  </summary>
                  <div className="debug-actions">
                    <button
                      type="button"
                      className="chip small"
                      onClick={() => {
                        const formatBoxes = (label: string, boxes: Box[]) =>
                          boxes.map((b, i) => `${label} ${i + 1}: x=${b.x}, y=${b.y}, w=${b.width}, h=${b.height}`).join("\n");
                        const text = [
                          `=== RAW PARSING RESULTS ===`,
                          `Portraits (${rawDebug.mugshot_count}):`,
                          formatBoxes("  Portrait", rawDebug.mugshots),
                          `\nBaby Photos (${rawDebug.baby_count}):`,
                          formatBoxes("  Baby", rawDebug.baby_photos),
                          `\nNames (${rawDebug.name_count}):`,
                          formatBoxes("  Name", rawDebug.names),
                          `\nQuotes (${rawDebug.quote_count}):`,
                          formatBoxes("  Quote", rawDebug.quotes),
                        ].join("\n");
                        navigator.clipboard.writeText(text).catch(console.error);
                      }}
                    >
                      📋 Copy raw debug
                    </button>
                    <button
                      type="button"
                      className="chip small"
                      onClick={() => {
                        const lines = slots.flatMap((slot, idx) =>
                          (["mugshot", "baby_photo", "name", "quote"] as (keyof TemplateSlots)[]).map((part) => {
                            const box = slot[part];
                            return `Slot ${idx + 1} ${part}: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`;
                          })
                        );
                        navigator.clipboard.writeText(lines.join("\n")).catch(console.error);
                      }}
                    >
                      📋 Copy slot coords
                    </button>
                  </div>
                </details>
              </div>
            )}
          </section>
        )}
      </main>
      </div>
    </>
  );
}

function TemplateParsing({
  workspaceId,
  onParsed,
  skipQuotes,
  onSkipQuotes,
  skipBabyPhotos,
  onSkipBabyPhotos,
  setStatus,
  setLoading,
  loading,
  onPreviewChange,
  annotated,
  clean,
  annotatedPreview,
  cleanPreview,
  onAnnotatedChange,
  onCleanChange,
  peoplePerSpread,
  setPeoplePerSpread,
  onRawDebug,
}: {
  workspaceId: string | null;
  onParsed: (resp: { template_id: string; width: number; height: number; slots: TemplateSlots[] }) => void;
  skipQuotes: boolean;
  onSkipQuotes: (v: boolean) => void;
  skipBabyPhotos: boolean;
  onSkipBabyPhotos: (v: boolean) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  loading: boolean;
  onPreviewChange?: (urls: { annotated?: string | null; clean?: string | null }) => void;
  annotated: File | null;
  clean: File | null;
  annotatedPreview: string | null;
  cleanPreview: string | null;
  onAnnotatedChange: (file: File | null) => void;
  onCleanChange: (file: File | null) => void;
  peoplePerSpread: number;
  setPeoplePerSpread: (n: number) => void;
  onRawDebug?: (debug: RawParseDebug | null) => void;
}) {
  const [mugshotColor, setMugshotColor] = useState<string>("");
  const [babyColor, setBabyColor] = useState<string>("");
  const [minArea, setMinArea] = useState<number>(800);
  const [nameColor, setNameColor] = useState<string>("");
  const [quoteColor, setQuoteColor] = useState<string>("");

  const normalizeHexColor = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const hex = withHash.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const expanded = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
      return `#${expanded.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    return null;
  };

  const thumbSizeForAspect = (maxSize: number, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
    if (aspect >= 1) {
      return { width: maxSize, height: Math.max(1, Math.round(maxSize / aspect)) };
    }
    return { width: Math.max(1, Math.round(maxSize * aspect)), height: maxSize };
  };

  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange({ annotated: annotatedPreview, clean: cleanPreview });
    }
  }, [cleanPreview, annotatedPreview, onPreviewChange]);

  const handleParse = async () => {
    if ((!annotated || !clean) && !workspaceId) {
      setStatus("Select both annotated and clean templates");
      return;
    }
    setLoading(true);
    setStatus("Parsing template...");
    try {
      const resp = await parseTemplate(annotated, clean, {
        workspaceId: workspaceId || undefined,
        mugshotColor: mugshotColor || undefined,
        babyColor: babyColor || undefined,
        nameColor: nameColor || undefined,
        quoteColor: quoteColor || undefined,
        minArea,
      });
      onParsed(resp);
      if (onRawDebug) onRawDebug(resp.raw_debug ?? null);
      setStatus("Template parsed successfully");
    } catch (err: any) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || "Template parsing failed";
      setStatus(`Template parsing failed: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      <p className="muted">
        Upload the annotated template (coloured blocks for portrait/baby/name/quote) and the clean template to be modified.
      </p>
      <UploadDropLabel accept="image/png" disabled={loading} onFile={(file) => onAnnotatedChange(file)}>
        <span>Annotated template (.png)</span>
        <input
          type="file"
          accept="image/png"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            onAnnotatedChange(file);
          }}
        />
        {annotatedPreview && <img src={annotatedPreview} alt="Annotated preview" className="template-thumb" />}
      </UploadDropLabel>
      <UploadDropLabel accept="image/png" disabled={loading} onFile={(file) => onCleanChange(file)}>
        <span>Clean template (.png)</span>
        <input
          type="file"
          accept="image/png"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            onCleanChange(file);
          }}
        />
        {cleanPreview && <img src={cleanPreview} alt="Clean preview" className="template-thumb" />}
      </UploadDropLabel>
      <label className="field">
        <span>People per spread (max slots to keep)</span>
        <input
          type="number"
          min={1}
          max={200}
          value={peoplePerSpread}
          onChange={(e) => setPeoplePerSpread(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="muted small">Slots beyond this count will be dropped during grouping.</span>
      </label>

      <details>
        <summary>
          <strong>Custom options</strong>
        </summary>
        <div className="stack" style={{ gap: 12, marginTop: 8 }}>
          <p className="muted small">
            Optional tweaks for templates that don’t parse cleanly with defaults. Use these to hide steps you don’t need,
            adjust detection sensitivity, or override the slot colours. Leave colour overrides blank to use the automatic
            defaults.
          </p>
          <ToggleSwitch
            checked={skipQuotes}
            onChange={onSkipQuotes}
            label="Skip quotes"
            description="Hides the Quotes step. Quotes are ignored during rendering (no defaults)."
          />
          <ToggleSwitch
            checked={skipBabyPhotos}
            onChange={onSkipBabyPhotos}
            label="Skip baby photos"
            description="Hides the Baby Photos step. Baby photos are ignored during rendering (no defaults)."
          />

          <div className="color-overrides">
            <div className="field color-override">
              <label htmlFor="mugshotColorText">Portrait colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Portrait colour override"
                  value={mugshotColor || "#22c55e"}
                  onChange={(e) => setMugshotColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="mugshotColorText"
                  type="text"
                  placeholder="#22c55e"
                  value={mugshotColor}
                  onChange={(e) => setMugshotColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setMugshotColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="babyColorText">Baby colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Baby colour override"
                  value={babyColor || "#3b82f6"}
                  onChange={(e) => setBabyColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="babyColorText"
                  type="text"
                  placeholder="#3b82f6"
                  value={babyColor}
                  onChange={(e) => setBabyColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setBabyColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="nameColorText">Name colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Name colour override"
                  value={nameColor || "#ff751f"}
                  onChange={(e) => setNameColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="nameColorText"
                  type="text"
                  placeholder="#ff751f"
                  value={nameColor}
                  onChange={(e) => setNameColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setNameColor(normalized);
                  }}
                />
              </div>
            </div>

            <div className="field color-override">
              <label htmlFor="quoteColorText">Quote colour override</label>
              <div className="inline">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="Quote colour override"
                  value={quoteColor || "#ff3131"}
                  onChange={(e) => setQuoteColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                />
                <input
                  id="quoteColorText"
                  type="text"
                  placeholder="#ff3131"
                  value={quoteColor}
                  onChange={(e) => setQuoteColor(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value);
                    if (normalized) setQuoteColor(normalized);
                  }}
                />
              </div>
            </div>
          </div>
          <div className="inline">
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMugshotColor("");
                setBabyColor("");
                setNameColor("");
                setQuoteColor("");
              }}
            >
              Reset colors to default
            </button>
          </div>
          <label className="field">
            <span title="Ignores boxes smaller than this; try 800-1500 for high-res templates">Minimum detected area (pixels²)</span>
            <input
              type="number"
              min={400}
              value={minArea}
              onChange={(e) => setMinArea(Math.max(400, Number(e.target.value) || 400))}
            />
            <span className="muted small">Higher numbers ignore tiny false positives; defaults to 800.</span>
          </label>
        </div>
      </details>
      <button className="primary" onClick={handleParse}>
        Parse template
      </button>
    </div>
  );
}

function MugshotMapping({
  workspaceId,
  defaultMugshotFilename,
  onDefaultMugshotFilename,
  ensureDefaultMugshotEagle,
  onMapped,
  setStatus,
  setLoading,
  setProgress,
  loading,
  people,
  setPeople,
  status,
  progress,
  canContinue,
  onBack,
  onReset,
  onContinue,
}: {
  workspaceId: string | null;
  defaultMugshotFilename: string | null;
  onDefaultMugshotFilename: (v: string | null) => void;
  ensureDefaultMugshotEagle: () => Promise<string | null>;
  onMapped: (people: PersonRecord[]) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  loading: boolean;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  status: string;
  progress: number;
  canContinue: boolean;
  onBack: () => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  const [sheet, setSheet] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const defaultNamingPattern = "\\d{3,4}";
  const [namingPattern, setNamingPattern] = useState<string>(defaultNamingPattern);
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [showAdvancedNaming, setShowAdvancedNaming] = useState(false);
  const [allowInsecureUploads, setAllowInsecureUploads] = useState(false);
  const [adjustments, setAdjustments] = useState<Record<number, { shiftCount?: number; replacement_mugshot?: string; remove?: boolean }>>({});
  const [adjustmentsResetNonce, setAdjustmentsResetNonce] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [originalPeople, setOriginalPeople] = useState<PersonRecord[] | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const ingestProcessingEstimateSecondsRef = useRef<number>(10);
  const didScrollForProgressRef = useRef(false);

  const didInitDefaultMugshot = useRef(false);

  useEffect(() => {
    if (!workspaceId) return;
    if (defaultMugshotFilename) return;
    if (didInitDefaultMugshot.current) return;

    (async () => {
      try {
        const filename = await ensureDefaultMugshotEagle();
        if (filename) didInitDefaultMugshot.current = true;
      } catch (err) {
        console.error(err);
        didInitDefaultMugshot.current = false;
      }
    })();
  }, [workspaceId, defaultMugshotFilename, ensureDefaultMugshotEagle, onDefaultMugshotFilename]);

  useEffect(() => {
    if (!loading || progress <= 0) {
      didScrollForProgressRef.current = false;
      return;
    }
    if (didScrollForProgressRef.current) return;
    didScrollForProgressRef.current = true;
    scrollPastTopBar();
  }, [loading, progress]);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const handleIngest = async () => {
    // Make sure the user can see status/progress updates.
    scrollPastTopBar();
    if (!workspaceId) {
      setStatus("Parse the template first");
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    if (insecureHttp) {
      setStatus("Warning: uploads over HTTP are not encrypted in transit.");
    }
    onMapped([]);
    setPeople([]);
    setAdjustments({});
    setAdjustmentsResetNonce((n) => n + 1);
    setOriginalPeople(null);
    setProgress(0);
    setLoading(true);
    setStatus("Mapping spreadsheet and portraits...");
    setWarnings([]);

    const opStartMs = performance.now();
    let uploadFinishedMs: number | null = null;
    let processingInterval: number | null = null;
    const clearProcessingInterval = () => {
      if (processingInterval !== null) {
        window.clearInterval(processingInterval);
        processingInterval = null;
      }
    };
    const startProcessingTicker = () => {
      if (processingInterval !== null) return;
      const startMs = uploadFinishedMs ?? performance.now();
      processingInterval = window.setInterval(() => {
        const elapsed = Math.max(0, (performance.now() - startMs) / 1000);
        const est = Math.max(1, ingestProcessingEstimateSecondsRef.current);
        const remaining = Math.max(0, est - elapsed);
        setProgress((prev) => {
          const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
          return Math.max(prev, Math.min(99, pct));
        });
        setStatus(`Processing portraits… ETA ${formatEtaSeconds(remaining)}`);
      }, 250);
    };
    try {
      const resp = await ingestSpreadsheet(
        workspaceId,
        sheet,
        zip,
        {
          namingPattern: namingPattern || undefined,
          advancedNameMatch,
          onProgress: (pct) => {
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
            const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);

            setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));

            if (clamped >= 100 && uploadFinishedMs === null) {
              uploadFinishedMs = performance.now();
              startProcessingTicker();
              return;
            }

            let etaPart = "";
            if (clamped >= 2 && elapsed >= 0.25) {
              const etaSeconds = (elapsed * (100 - clamped)) / clamped;
              if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
            }
            setStatus(`Uploading portraits… ${clamped}%${etaPart}`);
          },
        }
      );

      clearProcessingInterval();
      onMapped(resp.people);
      setPeople(resp.people);
      setOriginalPeople(resp.people.map((p) => ({ ...p })));
      setWarnings(resp.warnings ?? []);

      if (uploadFinishedMs !== null) {
        const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
        if (processingSeconds >= 0.25) {
          ingestProcessingEstimateSecondsRef.current =
            0.7 * ingestProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
        }
      }

      if (resp.warnings?.length) {
        setStatus(`People mapped with warnings: ${resp.warnings.join("; ")}`);
      } else {
        setStatus("People mapped. You can adjust later.");
      }
      setProgress(100);
    } catch (err) {
      clearProcessingInterval();
      console.error(err);
      setStatus("Mapping failed");
    } finally {
      clearProcessingInterval();
      setLoading(false);
    }
  };

  const resetToOriginalMapping = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset all mapping changes back to the original ingest result?");
      if (!ok) return;
    }
    if (!originalPeople) {
      setStatus("No original mapping to reset to");
      return;
    }
    setPeople(originalPeople.map((p) => ({ ...p })));
    setAdjustments({});
    setAdjustmentsResetNonce((n) => n + 1);
    setStatus("Reset to original mapping");
  };

  const setShiftEnabled = (personIndex: number, enabled: boolean) => {
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      const nextShiftCount = enabled ? Math.max(1, Math.floor(current.shiftCount ?? 1)) : 0;
      const next = { ...current, shiftCount: nextShiftCount };
      if (!next.shiftCount && !next.replacement_mugshot) {
        const { [personIndex]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personIndex]: next };
    });
  };

  const setShiftCount = (personIndex: number, shiftCount: number) => {
    const normalized = Number.isFinite(shiftCount) ? Math.max(0, Math.floor(shiftCount)) : 0;
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      const next = { ...current, shiftCount: normalized };
      if (!next.shiftCount && !next.replacement_mugshot && !next.remove) {
        const { [personIndex]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personIndex]: next };
    });
  };

  const setRemoveEnabled = (personIndex: number, enabled: boolean) => {
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      const next = {
        ...current,
        remove: enabled,
        // Remove and replacement conflict; remove wins.
        replacement_mugshot: enabled ? undefined : current.replacement_mugshot,
      };
      if (!next.shiftCount && !next.replacement_mugshot && !next.remove) {
        const { [personIndex]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personIndex]: next };
    });
  };

  const uploadReplacement = async (personIndex: number, file: File | null) => {
    if (!workspaceId || !file) return;
    try {
      const filename = await uploadImage(workspaceId, "mugshot", file);
      setAdjustments((prev) => ({
        ...prev,
        [personIndex]: { ...prev[personIndex], remove: false, replacement_mugshot: filename }
      }));
      setStatus("Uploaded replacement portrait");
    } catch (err) {
      console.error(err);
      setStatus("Upload failed");
    }
  };

  const uploadDefaultMugshot = async (file: File | null) => {
    if (!workspaceId || !file) return;
    try {
      const filename = await uploadImage(workspaceId, "mugshot", file);
      onDefaultMugshotFilename(filename);
      setStatus("Default portrait updated");
    } catch (err) {
      console.error(err);
      setStatus("Default portrait upload failed");
    }
  };

  const applyDecisions = async () => {
    if (!workspaceId) return;
    const entries = Object.entries(adjustments)
      .map(([personIndex, entry]) => ({ personIndex: Number(personIndex), entry }))
      .filter(({ personIndex }) => Number.isFinite(personIndex));

    const shiftPayload: { person_index: number; action: "shift" }[] = [];
    const removePayload: { person_index: number; action: "remove" }[] = [];
    const replacePayload: { person_index: number; action: "replace"; replacement_mugshot: string }[] = [];

    entries
      .sort((a, b) => a.personIndex - b.personIndex)
      .forEach(({ personIndex, entry }) => {
        const shiftCount = Math.max(0, Math.floor(entry.shiftCount ?? 0));
        for (let i = 0; i < shiftCount; i++) {
          shiftPayload.push({ person_index: personIndex, action: "shift" });
        }
      });

    entries
      .sort((a, b) => a.personIndex - b.personIndex)
      .forEach(({ personIndex, entry }) => {
        if (entry.remove) {
          removePayload.push({ person_index: personIndex, action: "remove" });
          return;
        }
        if (entry.replacement_mugshot) {
          replacePayload.push({
            person_index: personIndex,
            action: "replace",
            replacement_mugshot: entry.replacement_mugshot
          });
        }
      });

    const payload = [...shiftPayload, ...removePayload, ...replacePayload];

    if (!payload.length) {
      setStatus("No changes to apply");
      return;
    }
    setLoading(true);
    setStatus("Applying mapping changes...");
    try {
      const resp = await applyMapping(workspaceId, people, payload);
      setPeople(resp.people);
      setStatus("Mapping updated");
      setAdjustments({});
      setAdjustmentsResetNonce((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Mapping update failed");
    } finally {
      setLoading(false);
    }
  };

  const swapPositions = (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx) return;
    if (sourceIdx < 0 || targetIdx < 0) return;
    if (sourceIdx >= people.length || targetIdx >= people.length) return;
    const next = [...people];
    const tmp = next[sourceIdx];
    next[sourceIdx] = next[targetIdx];
    next[targetIdx] = tmp;
    setPeople(next);
  };

  const handleSwapDrop = (targetIdx: number, evt: React.DragEvent<HTMLDivElement>) => {
    if (!swapMode) return;
    evt.preventDefault();
    const payload = evt.dataTransfer.getData("text/plain");
    const sourceIdx = dragIdx ?? Number(payload);
    if (Number.isNaN(sourceIdx) || sourceIdx == null || sourceIdx === targetIdx) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    swapPositions(sourceIdx, targetIdx);
    setDropTarget(null);
    setDragIdx(null);
  };

  return (
    <div className="mapping-layout">
      <div className="mapping-top">
        <div className="panel">
          <div className="stack">
            {insecureHttp && (
              <div className="callout warn">
                <div className="stack" style={{ gap: 8 }}>
                  <strong>
                    <span className="warn-icon" aria-hidden="true">⚠</span>
                    Warning: Unencrypted uploads (HTTP)
                  </strong>
                  <div className="muted small">
                    You are not on HTTPS. Spreadsheets and photos may be visible to others on the network while uploading.
                    Use HTTPS or run on localhost if possible.
                  </div>
                  <ToggleSwitch
                    checked={allowInsecureUploads}
                    onChange={setAllowInsecureUploads}
                    label="I understand (continue over HTTP)"
                  />
                </div>
              </div>
            )}
            <p className="muted">
              Upload a spreadsheet (.xlsx or .csv) and a portraits ZIP. By default, this step matches portraits by
              digits first (example: 001.jpg → row 1) using the filename pattern, with rows starting at 1 (header row is
              ignored). With <strong>Prioritize names</strong> (enabled by default), the app will first assign any files
              whose filenames contain a student's first + last name, then fill the remaining rows by digits (numbered
              files may shift down if a name match took that row). Non-matching files are skipped and listed in warnings.
            </p>
            <UploadDropLabel accept=".xlsx,.csv" disabled={loading} onFile={(file) => setSheet(file)}>
              <span>Spreadsheet</span>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setSheet(e.target.files?.[0] ?? null)} />
            </UploadDropLabel>
            <UploadDropLabel accept=".zip" disabled={loading} onFile={(file) => setZip(file)}>
              <span>Portraits zip</span>
              <input type="file" accept=".zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} />
            </UploadDropLabel>
            <ToggleSwitch
              checked={showAdvancedNaming}
              onChange={setShowAdvancedNaming}
              label="Advanced filename options"
              description="Change the regex used to extract the row number from portrait filenames."
            />

            {showAdvancedNaming && (
              <label className="field">
                <span>Filename pattern (regex)</span>
                <input
                  type="text"
                  value={namingPattern}
                  onChange={(e) => setNamingPattern(e.target.value)}
                  placeholder={defaultNamingPattern}
                />
                <span className="muted small">
                  Default matches 3–4 digit stems (e.g., 001.jpg). Use ^ and $ for exact matches; non-matching files are
                  skipped.
                </span>
              </label>
            )}

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Prioritize names (case-insensitive)"
              description="When on, filenames containing FIRST+LAST (or LAST+FIRST) map to that student first, then numbered portraits fill the remaining rows (numbered files may shift down)."
            />

            <div className="stack" style={{ gap: 6 }}>
              <strong>Default portrait (optional)</strong>
              <div className="muted small">Used when a student has no portrait. You can replace it any time.</div>
              {workspaceId && defaultMugshotFilename ? (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img
                    src={assetUrl(workspaceId, "mugshot", defaultMugshotFilename)}
                    alt="default portrait"
                    className="thumb"
                  />
                  <span className="muted small">Current default: {defaultMugshotFilename}</span>
                </div>
              ) : (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img src={withBase("assets/default_eagle.svg")} alt="default portrait (eagle)" className="thumb" />
                  <span className="muted small">Current default: eagle</span>
                </div>
              )}

              <UploadDropLabel accept="image/*" disabled={loading} onFile={(file) => uploadDefaultMugshot(file)}>
                <span className="muted small">Upload default portrait</span>
                <input type="file" accept="image/*" onChange={(e) => uploadDefaultMugshot(e.target.files?.[0] ?? null)} />
              </UploadDropLabel>

              <div className="inline" style={{ gap: 10 }}>
                <button type="button" disabled={loading} onClick={async () => {
                  try {
                    const filename = await ensureDefaultMugshotEagle();
                    if (filename) {
                      setStatus("Default portrait set to eagle");
                    }
                  } catch (err) {
                    console.error(err);
                    setStatus("Could not set default eagle portrait");
                  }
                }}>
                  Use eagle default
                </button>
                <button type="button" disabled={loading} onClick={() => onDefaultMugshotFilename(null)}>
                  Clear default
                </button>
              </div>
            </div>

            <button className="primary" onClick={handleIngest} disabled={loading}>
              {loading ? "Ingesting..." : "Ingest spreadsheet"}
            </button>
            {warnings.length > 0 && (
              <details className="muted small">
                <summary>
                  <strong>Skipped portraits ({warnings.length})</strong>
                </summary>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="stack">
            <div className="actions mapping-actions">
              <button onClick={onBack} disabled={loading}>
                Back
              </button>
              <button type="button" className="danger" onClick={onReset} disabled={loading}>
                Reset all
              </button>
              <button className="primary" onClick={onContinue} disabled={!canContinue || loading}>
                Continue
              </button>
            </div>
            {status && <p className="muted">{status}</p>}
            {loading && progress > 0 && <ProgressBar progress={progress} />}
          </div>
        </div>
      </div>

      <div className="panel">
        {workspaceId && people.length > 0 ? (
          <div className="stack">
            <div className="inline">
              <button className="primary" onClick={applyDecisions} disabled={loading || !people.length}>
                Apply mapping adjustments
              </button>
              <button type="button" className="danger" onClick={resetToOriginalMapping} disabled={loading || !originalPeople}>
                Reset to original mapping
              </button>
              <button type="button" className={clsx("chip", { active: swapMode })} onClick={() => setSwapMode((v) => !v)}>
                {swapMode ? "Swap mode: on" : "Swap mode: off"}
              </button>
            </div>

            {swapMode && <p className="muted small">Drag a person card onto another to swap positions.</p>}

            <div className="people-grid">
              {people.map((p, rowIdx) => {
                const cardClasses = clsx("people-card", {
                  "swap-mode": swapMode,
                  dragging: dragIdx === rowIdx,
                  "swap-target": dropTarget === p.index && swapMode,
                });
                return (
                <div
                  className={cardClasses}
                  key={p.index}
                  draggable={swapMode}
                  onDragStart={(evt) => {
                    if (!swapMode) return;
                    setDragIdx(rowIdx);
                    evt.dataTransfer.effectAllowed = "move";
                    evt.dataTransfer.setData("text/plain", String(rowIdx));
                  }}
                  onDragOver={(evt) => {
                    if (!swapMode) return;
                    evt.preventDefault();
                    setDropTarget(p.index);
                  }}
                  onDragLeave={() => swapMode && setDropTarget(null)}
                  onDrop={(evt) => handleSwapDrop(rowIdx, evt)}
                >
                  <div className="people-card-header">
                    <div className="stack" style={{ gap: 4 }}>
                      <div className="muted small">#{p.index}</div>
                      <div>
                        <strong>
                          {p.first_name} {p.last_name}
                        </strong>
                      </div>
                    </div>
                    <div className="thumb-cell">
                      {p.mugshot_filename && workspaceId ? (
                        <img
                          src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                          alt="portrait"
                          className="thumb"
                        />
                      ) : defaultMugshotFilename && workspaceId ? (
                        <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                          <img
                            src={assetUrl(workspaceId, "mugshot", defaultMugshotFilename)}
                            alt="default portrait"
                            className="thumb"
                          />
                          <div className="muted small">(default)</div>
                        </div>
                      ) : (
                        <div className="muted small">(missing)</div>
                      )}
                    </div>
                  </div>

                  <div className="people-card-actions" style={{ alignItems: "center", gap: 10 }}>
                    <div className="stack" style={{ gap: 8, width: "100%" }}>
                      <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                        <ToggleSwitch
                          checked={(adjustments[p.index]?.shiftCount ?? 0) > 0}
                          onChange={(v) => setShiftEnabled(p.index, v)}
                          disabled={loading}
                          label="Shift"
                          className="small"
                          style={{ margin: 0 }}
                        />

                        <label className="inline" style={{ alignItems: "center", gap: 8, margin: 0 }}>
                          <span className="muted small">#</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={Math.max(0, Math.floor(adjustments[p.index]?.shiftCount ?? 0))}
                            disabled={loading || (adjustments[p.index]?.shiftCount ?? 0) <= 0}
                            onChange={(e) => setShiftCount(p.index, Number(e.target.value))}
                            style={{ width: 72 }}
                          />
                        </label>
                      </div>

                      <ToggleSwitch
                        checked={Boolean(adjustments[p.index]?.remove)}
                        onChange={(v) => setRemoveEnabled(p.index, v)}
                        disabled={loading}
                        label="Reset to default portrait"
                        className="small"
                        style={{ margin: 0 }}
                      />
                    </div>
                  </div>

                  <UploadDropLabel
                    key={`${p.index}-${adjustmentsResetNonce}`}
                    accept="image/*"
                    disabled={loading || Boolean(adjustments[p.index]?.remove)}
                    onFile={(file) => uploadReplacement(p.index, file)}
                  >
                    <span className="muted small">Upload replacement portrait</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => uploadReplacement(p.index, e.target.files?.[0] ?? null)}
                    />
                    <div className="muted small">{adjustments[p.index]?.replacement_mugshot ?? "No replacement"}</div>
                  </UploadDropLabel>
                </div>
                );
              })}
            </div>

            <button onClick={applyDecisions} disabled={loading}>
              Apply mapping adjustments
            </button>
          </div>
        ) : (
          <p className="muted">No people loaded yet. Ingest a spreadsheet and portraits ZIP above.</p>
        )}
      </div>
    </div>
  );
}

function QuotesStep({
  defaultQuote,
  onDefaultQuote,
  workspaceId,
  setStatus,
  setLoading,
  setProgress,
  people,
  setPeople,
  loading,
  status,
  progress,
  canContinue,
  onBack,
  onReset,
  onContinue,
}: {
  defaultQuote: string;
  onDefaultQuote: (v: string) => void;
  workspaceId: string | null;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  loading: boolean;
  status: string;
  progress: number;
  canContinue: boolean;
  onBack: () => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [quotesSheet, setQuotesSheet] = useState<File | null>(null);
  const [quotesWarnings, setQuotesWarnings] = useState<string[]>([]);
  const [allowInsecureUploads, setAllowInsecureUploads] = useState(false);

  const quotesProcessingEstimateSecondsRef = useRef<number>(6);
  const didScrollForProgressRef = useRef(false);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  useEffect(() => {
    if (!loading || progress <= 0) {
      didScrollForProgressRef.current = false;
      return;
    }
    if (didScrollForProgressRef.current) return;
    didScrollForProgressRef.current = true;
    scrollPastTopBar();
  }, [loading, progress]);

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const handleProcessQuotes = async () => {
    // Make sure the user can see status/progress updates.
    scrollPastTopBar();
    if (!workspaceId || !quotesSheet) {
      setStatus("Select a quotes spreadsheet (.xlsx or .csv) and ensure template is parsed first");
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    if (insecureHttp) {
      setStatus("Warning: uploads over HTTP are not encrypted in transit.");
    }
    try {
      setProgress(0);
      setLoading(true);
      setStatus("Uploading and matching quotes...");
      setQuotesWarnings([]);

      const opStartMs = performance.now();
      let uploadFinishedMs: number | null = null;
      let processingInterval: number | null = null;
      const clearProcessingInterval = () => {
        if (processingInterval !== null) {
          window.clearInterval(processingInterval);
          processingInterval = null;
        }
      };
      const startProcessingTicker = () => {
        if (processingInterval !== null) return;
        const startMs = uploadFinishedMs ?? performance.now();
        processingInterval = window.setInterval(() => {
          const elapsed = Math.max(0, (performance.now() - startMs) / 1000);
          const est = Math.max(1, quotesProcessingEstimateSecondsRef.current);
          const remaining = Math.max(0, est - elapsed);
          setProgress((prev) => {
            const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
            return Math.max(prev, Math.min(99, pct));
          });
          setStatus(`Processing quotes… ETA ${formatEtaSeconds(remaining)}`);
        }, 250);
      };

      const resp = await uploadQuotesSpreadsheet(workspaceId, people, quotesSheet, {
        advancedNameMatch,
        onProgress: (pct) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
          const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);

          setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));

          if (clamped >= 100 && uploadFinishedMs === null) {
            uploadFinishedMs = performance.now();
            startProcessingTicker();
            return;
          }

          let etaPart = "";
          if (clamped >= 2 && elapsed >= 0.25) {
            const etaSeconds = (elapsed * (100 - clamped)) / clamped;
            if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
          }
          setStatus(`Uploading quotes… ${clamped}%${etaPart}`);
        },
      });

      clearProcessingInterval();
      setPeople(resp.people);
      const warnings = resp.warnings ?? [];
      setQuotesWarnings(warnings);
      setStatus(warnings.length ? `Quotes spreadsheet processed with ${warnings.length} warnings` : "Quotes spreadsheet processed");

      if (uploadFinishedMs !== null) {
        const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
        if (processingSeconds >= 0.25) {
          quotesProcessingEstimateSecondsRef.current =
            0.7 * quotesProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
        }
      }

      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus("Quotes spreadsheet upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mapping-layout">
      <div className="mapping-top">
        <div className="panel">
          <div className="stack">
            {insecureHttp && (
              <div className="callout warn">
                <div className="stack" style={{ gap: 8 }}>
                  <strong>
                    <span className="warn-icon" aria-hidden="true">⚠</span>
                    Warning: Unencrypted uploads (HTTP)
                  </strong>
                  <div className="muted small">
                    You are not on HTTPS. Spreadsheets may be visible to others on the network while uploading.
                    Use HTTPS or run on localhost if possible.
                  </div>
                  <ToggleSwitch
                    checked={allowInsecureUploads}
                    onChange={setAllowInsecureUploads}
                    label="I understand (continue over HTTP)"
                  />
                </div>
              </div>
            )}
            <p className="muted">
              Upload a quotes spreadsheet (.xlsx or .csv) and click <strong>Process</strong>. The app matches spreadsheet rows to students by name
              and sets each person's quote (missing quotes are allowed). If a row has a <strong>quote</strong> column, it prefers that; otherwise it
              picks the most quote-like cell and ignores obvious non-quotes like emails/URLs.
            </p>

            <UploadDropLabel accept=".xlsx,.csv" disabled={loading} onFile={(file) => setQuotesSheet(file)}>
              <span>Quotes spreadsheet (.xlsx or .csv)</span>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setQuotesSheet(e.target.files?.[0] ?? null)} />
            </UploadDropLabel>

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Advanced name matching"
              description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
            />

            <div className="stack" style={{ gap: 6 }}>
              <strong>Default quote</strong>
              <div className="muted small">Used when a student has no quote.</div>
              <textarea
                value={defaultQuote}
                onChange={(e) => onDefaultQuote(e.target.value)}
                placeholder="Enter a default quote"
                rows={2}
              />
            </div>

            <button className="primary" type="button" onClick={handleProcessQuotes} disabled={!quotesSheet || loading}>
              {loading ? "Processing..." : "Process quotes"}
            </button>

            {quotesWarnings.length > 0 && (
              <details className="muted small">
                <summary>
                  <strong>Quotes warnings ({quotesWarnings.length})</strong>
                </summary>
                <ul>
                  {quotesWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

          </div>
        </div>

        <div className="panel">
          <div className="stack">
            <div className="actions mapping-actions">
              <button type="button" onClick={onBack}>
                Back
              </button>
              <button type="button" className="danger" onClick={onReset}>
                Reset all
              </button>
              <button className="primary" type="button" onClick={onContinue} disabled={!canContinue}>
                Continue
              </button>
            </div>
            {status && <p className="muted">{status}</p>}
            {loading && progress > 0 && <ProgressBar progress={progress} />}
          </div>
        </div>
      </div>

      <div className="panel">
        {workspaceId && people.length > 0 ? (
          <div className="people-grid">
            {people.map((p, idx) => (
              <div className="people-card" key={p.index}>
                <div className="people-card-header">
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="muted small">#{p.index}</div>
                    <div>
                      <strong>
                        {p.first_name} {p.last_name}
                      </strong>
                    </div>
                  </div>
                  <div className="thumb-stack">
                    {p.mugshot_filename ? (
                      <img
                        src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                        alt="portrait"
                        className="thumb"
                      />
                    ) : (
                      <div className="muted small">(missing mugshot)</div>
                    )}
                  </div>
                </div>

                <label className="field">
                  <span>Quote (optional)</span>
                  <textarea
                    rows={2}
                    value={p.quote ?? ""}
                    onChange={(e) => updatePerson(idx, (prev) => ({ ...prev, quote: e.target.value }))}
                    placeholder="Quote (optional)"
                  />
                </label>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No people loaded yet. Complete portrait mapping first.</p>
        )}
      </div>
    </div>
  );
}

function BabyPhotosStep({
  workspaceId,
  babyMaskBox,
  defaultBabyFilename,
  defaultQuote,
  onDefaultBabyFilename,
  babyBackgroundColor,
  onBabyBackgroundColor,
  setStatus,
  setLoading,
  setProgress,
  people,
  setPeople,
  loading,
  status,
  progress,
  canContinue,
  onBack,
  onReset,
  onContinue,
}: {
  workspaceId: string | null;
  babyMaskBox: Box | null;
  defaultBabyFilename: string | null;
  defaultQuote: string;
  onDefaultBabyFilename: (v: string | null) => void;
  babyBackgroundColor: string;
  onBabyBackgroundColor: (v: string) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  loading: boolean;
  status: string;
  progress: number;
  canContinue: boolean;
  onBack: () => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  const [babyFile, setBabyFile] = useState<File | null>(null);
  const [babyZip, setBabyZip] = useState<File | null>(null);
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [partialNameMatch, setPartialNameMatch] = useState(false);
  const [removeBabyBackground, setRemoveBabyBackground] = useState(false);
  const [babyBackgroundMode, setBabyBackgroundMode] = useState<"simple" | "complex" | "ultra_complex">("simple");
  const [allowInsecureUploads, setAllowInsecureUploads] = useState(false);
  const [babyZipWarnings, setBabyZipWarnings] = useState<string[]>([]);
  const [babyThumbError, setBabyThumbError] = useState<Record<number, boolean>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [editingBaseSrc, setEditingBaseSrc] = useState<string | null>(null);
  const [editingFilename, setEditingFilename] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingBusy, setEditingBusy] = useState(false);
  const [editingAction, setEditingAction] = useState<"apply" | "remove_background" | null>(null);
  const [removeBgPopoverOpen, setRemoveBgPopoverOpen] = useState(false);
  const [removeBgMode, setRemoveBgMode] = useState<"simple" | "complex" | "ultra_complex">("simple");
  const [removeBgProgress, setRemoveBgProgress] = useState(0);
  const [removeBgEtaSeconds, setRemoveBgEtaSeconds] = useState<number | null>(null);
  const [removeBgMessage, setRemoveBgMessage] = useState<string>("");
  const [dirtyEdits, setDirtyEdits] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [babyBgPickActive, setBabyBgPickActive] = useState(false);
  const [babyBgPickUrl, setBabyBgPickUrl] = useState<string | null>(null);
  const [babyBgPickBusy, setBabyBgPickBusy] = useState(false);
  const babyBgHexInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const editorCropRef = useRef<HTMLDivElement | null>(null);
  const [editorCropSize, setEditorCropSize] = useState<{ width: number; height: number } | null>(null);
  const didInitDefaultBaby = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const babyZipProcessingEstimateSecondsRef = useRef<number>(12);
  const processingSnapshotRef = useRef<{
    people: PersonRecord[];
    defaultBabyFilename: string | null;
    babyZipWarnings: string[];
  } | null>(null);

  const normalizeHexColor = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const hex = withHash.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const expanded = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
      return `#${expanded.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    return null;
  };

  const thumbSizeForAspect = (maxSize: number, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
    if (aspect >= 1) return { width: maxSize, height: Math.max(1, Math.round(maxSize / aspect)) };
    return { width: Math.max(1, Math.round(maxSize * aspect)), height: maxSize };
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  };

  useEffect(() => {
    return () => {
      if (babyBgPickUrl) URL.revokeObjectURL(babyBgPickUrl);
    };
  }, [babyBgPickUrl]);

  useEffect(() => {
    // If the default baby image changes, clear any cached thumbnail errors so the UI can retry.
    setBabyThumbError({});
  }, [defaultBabyFilename]);

  useEffect(() => {
    const ensureDefaultAbcBlocks = async () => {
      if (!workspaceId) return;
      if (defaultBabyFilename) return;
      if (didInitDefaultBaby.current) return;

      const insecureHttp =
        typeof window !== "undefined" &&
        !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
        window.location.protocol !== "https:";
      if (insecureHttp && !allowInsecureUploads) {
        // Don't auto-upload defaults over insecure HTTP unless user explicitly opts in.
        return;
      }
      try {
        const resp = await fetch(withBase("assets/Default_Baby_Photo_ABC_Blocks.webp"));
        if (!resp.ok) throw new Error("Could not load default baby asset");
        const blob = await resp.blob();
        const file = new File([blob], "default_baby_abc_blocks.webp", { type: "image/webp" });
        const filename = await uploadImage(workspaceId, "baby", file);
        onDefaultBabyFilename(filename);
        setStatus("Default baby photo set to ABC blocks");
        didInitDefaultBaby.current = true;
      } catch (err) {
        console.error(err);
        // Allow retry on transient failures.
        didInitDefaultBaby.current = false;
      }
    };
    ensureDefaultAbcBlocks();
  }, [workspaceId, defaultBabyFilename, onDefaultBabyFilename, setStatus, allowInsecureUploads]);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const maskUrl = workspaceId && babyMaskBox ? babyMaskUrl(workspaceId, babyMaskBox) : null;
  const cropAspect = babyMaskBox ? babyMaskBox.width / Math.max(1, babyMaskBox.height) : 1;
  const outSize = babyMaskBox
    ? { width: Math.max(1, Math.round(babyMaskBox.width)), height: Math.max(1, Math.round(babyMaskBox.height)) }
    : { width: 512, height: 512 };

  // Keep thumbnails framed exactly like the editor's default view.
  const babyThumbDims = thumbSizeForAspect(96, cropAspect);
  // If the user selected a background fill colour, show it behind transparent baby PNGs.
  const babyFillColor = normalizeHexColor(babyBackgroundColor);

  useEffect(() => {
    // Ensure the crop viewport spans the full mask area (fills the container).
    const el = editorCropRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      setEditorCropSize({ width: w, height: h });
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [editingIdx, editingSrc, outSize.width, outSize.height]);

  const openEditor = (idx: number) => {
    if (!workspaceId) return;
    const p = people[idx];
    const babyFilename = p.baby_photo_filename ?? defaultBabyFilename;
    if (!babyFilename) {
      setStatus("No baby photo available to edit");
      return;
    }
    setEditingIdx(idx);
    setEditingName(`${p.first_name} ${p.last_name}`);
    const base = `${assetUrl(workspaceId, "baby", babyFilename)}&nonce=${Date.now()}`;
    setEditingFilename(babyFilename);
    setEditingBaseSrc(base);
    setEditingSrc(base);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setRemoveBgMode(babyBackgroundMode);
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const closeEditor = () => {
    if (editingBusy) return;
    if (dirtyEdits) {
      setShowDiscardWarning(true);
      return;
    }
    setEditingIdx(null);
    setEditingSrc(null);
    setEditingBaseSrc(null);
    setEditingFilename(null);
    setEditingName("");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const discardAndCloseEditor = () => {
    if (editingBusy) return;
    // Revert any preview URLs.
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setEditingIdx(null);
    setEditingSrc(null);
    setEditingBaseSrc(null);
    setEditingFilename(null);
    setEditingName("");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setStatus("Edits discarded");
  };

  const applyEdits = async () => {
    if (!workspaceId) return;
    if (editingIdx === null || !editingSrc || !croppedAreaPixels) {
      setStatus("Adjust the crop first");
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    setEditingBusy(true);
    setEditingAction("apply");
    try {
      const personIndex = people[editingIdx]?.index;
      if (!personIndex) {
        setStatus("Could not apply changes (missing person)");
        return;
      }

      // Avoid quality loss across edits:
      // - Prefer cropping from the original session source (`editingBaseSrc`) rather than
      //   whatever is currently displayed.
      // - If a background-removal preview is active, crop from that preview.
      const hasPreview = Boolean(previewUrlRef.current) && previewUrlRef.current === editingSrc;
      const srcForCrop = hasPreview ? editingSrc : (editingBaseSrc || editingSrc);

      // Export at higher resolution than the template slot (up to a cap) so repeated edits
      // don't progressively lose detail. Generation will downscale as needed.
      const MAX_EXPORT_DIM = 2048;
      const cropW = Math.max(1, Math.round(croppedAreaPixels.width));
      const cropH = Math.max(1, Math.round(croppedAreaPixels.height));
      const minW = Math.max(1, Math.round(outSize.width));
      const minH = Math.max(1, Math.round(outSize.height));
      const desiredW = Math.max(minW, cropW);
      const desiredH = Math.max(minH, cropH);
      const scale = Math.min(1, MAX_EXPORT_DIM / Math.max(desiredW, desiredH));
      const exportSize = {
        width: Math.max(minW, Math.round(desiredW * scale)),
        height: Math.max(minH, Math.round(desiredH * scale)),
      };

      const blob = await cropToPngBlob(srcForCrop, croppedAreaPixels, exportSize);
      const file = new File([blob], `baby_edit_${personIndex}_${Date.now()}.png`, { type: "image/png" });

      const uploadedFilename = await uploadImage(workspaceId, "baby", file);
      updatePerson(editingIdx, (p) => ({ ...p, baby_photo_filename: uploadedFilename }));
      setBabyThumbError((prev) => ({ ...prev, [personIndex]: false }));

      // Refresh editor to the saved image *without* a zoom jump:
      // the newly uploaded file is already cropped to the current framing, so reset cropper
      // state to defaults and swap the image source.
      const nextBase = `${assetUrl(workspaceId, "baby", uploadedFilename)}&nonce=${Date.now()}`;
      setEditingFilename(uploadedFilename);
      setEditingBaseSrc(nextBase);
      setEditingSrc(nextBase);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setDirtyEdits(false);
      setStatus("Baby photo updated");
    } catch (err) {
      console.error(err);
      setStatus("Could not apply changes");
    } finally {
      setEditingBusy(false);
      setEditingAction(null);
    }
  };

  const runBackgroundRemovalPreview = async () => {
    if (!workspaceId || !editingFilename) return;
    if (editingBusy) return;
    setEditingBusy(true);
    setEditingAction("remove_background");
    setRemoveBgProgress(1);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("Starting…");
    try {
      const { job_id } = await startRemoveBackgroundPreviewJob({
        workspaceId,
        kind: "baby",
        filename: editingFilename,
        backgroundMode: removeBgMode,
      });

      const start = Date.now();
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
        // eslint-disable-next-line no-await-in-loop
        const s = await removeBackgroundPreviewStatus(job_id);
        setRemoveBgProgress(Math.max(1, Math.min(100, Math.round(s.progress ?? 0))));
        setRemoveBgEtaSeconds(typeof s.eta_seconds === "number" ? s.eta_seconds : null);
        setRemoveBgMessage((s.message || "Working…").toString());

        if (s.status === "done") {
          // eslint-disable-next-line no-await-in-loop
          const blob = await fetchRemoveBackgroundPreviewResult(job_id);
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setEditingSrc(url);
          setDirtyEdits(true);
          setRemoveBgMessage("Preview ready");
          setRemoveBgProgress(100);
          break;
        }
        if (s.status === "error") {
          setStatus(s.error ? `Background removal failed: ${s.error}` : "Background removal failed");
          break;
        }
        if (Date.now() - start > 120_000) {
          setStatus("Background removal is taking unusually long. Please try again.");
          break;
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Background removal failed");
    } finally {
      setEditingBusy(false);
      setEditingAction(null);
    }
  };

  const handlePerPersonBaby = async (idx: number, file: File | null) => {
    if (!workspaceId || !file) {
      setStatus("Select a baby photo and ensure template is parsed first");
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    try {
      const filename = await uploadImage(workspaceId, "baby", file, {
        removeBackground: removeBabyBackground,
        backgroundMode: babyBackgroundMode,
      });
      updatePerson(idx, (p) => ({ ...p, baby_photo_filename: filename }));
      setBabyThumbError((prev) => ({ ...prev, [people[idx].index]: false }));
      setStatus(`Uploaded baby photo for ${people[idx].first_name}`);
    } catch (err) {
      console.error(err);
      setStatus("Upload failed");
    }
  };


  const handleProcess = async () => {
    // Make sure the user can see status/progress updates.
    scrollPastTopBar();
    if (!workspaceId) {
      setStatus("Ensure template is parsed first");
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    if (insecureHttp) {
      setStatus("Warning: uploads over HTTP are not encrypted in transit.");
    }
    if (!babyFile && !babyZip) {
      setStatus("Select a baby photo and/or a baby ZIP to process");
      return;
    }
    if (abortRef.current) {
      setStatus("Already processing");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    processingSnapshotRef.current = {
      people: people.map((p) => ({ ...p })),
      defaultBabyFilename,
      babyZipWarnings: [...babyZipWarnings],
    };

    setLoading(true);
    setProgress(0);
    try {
      setStatus("Processing baby photos...");

      if (babyFile) {
        const stageBase = 0;
        const stageWeight = babyZip ? 20 : 100;
        const opStartMs = performance.now();
        setStatus("Uploading default baby…");
        const filename = await uploadImage(workspaceId, "baby", babyFile, {
          removeBackground: removeBabyBackground,
          backgroundMode: babyBackgroundMode,
          signal: controller.signal,
          onProgress: (pct) => {
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
            const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
            const overall = stageBase + (clamped * stageWeight) / 100;
            setProgress(Math.max(1, Math.min(99, Math.round(overall))));
            let etaPart = "";
            if (clamped >= 2 && elapsed >= 0.25) {
              const etaSeconds = (elapsed * (100 - clamped)) / clamped;
              if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
            }
            setStatus(`Uploading default baby… ${clamped}%${etaPart}`);
          },
        });
        onDefaultBabyFilename(filename);
        setProgress((prev) => Math.max(prev, babyZip ? 20 : 100));
      }

      if (babyZip) {
        const stageBase = babyFile ? 20 : 0;
        const stageWeight = babyFile ? 80 : 100;
        const opStartMs = performance.now();
        let uploadFinishedMs: number | null = null;
        let processingInterval: number | null = null;
        const clearProcessingInterval = () => {
          if (processingInterval !== null) {
            window.clearInterval(processingInterval);
            processingInterval = null;
          }
        };
        const startProcessingTicker = () => {
          if (processingInterval !== null) return;
          const startMs = uploadFinishedMs ?? performance.now();
          processingInterval = window.setInterval(() => {
            const elapsed = Math.max(0, (performance.now() - startMs) / 1000);
            const est = Math.max(1, babyZipProcessingEstimateSecondsRef.current);
            const remaining = Math.max(0, est - elapsed);
            setProgress((prev) => {
              const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
              const weighted = stageBase + (pct * stageWeight) / 100;
              return Math.max(prev, Math.min(99, Math.round(weighted)));
            });
            setStatus(`Processing baby ZIP… ETA ${formatEtaSeconds(remaining)}`);
          }, 250);
        };

        setStatus("Uploading baby ZIP…");
        setBabyZipWarnings([]);
        const resp = await uploadBabyZip(workspaceId, people, babyZip, {
          advancedNameMatch,
          partialNameMatch: advancedNameMatch && partialNameMatch,
          removeBackground: removeBabyBackground,
          backgroundMode: babyBackgroundMode,
          signal: controller.signal,
          onProgress: (pct) => {
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
            const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
            const weighted = stageBase + (clamped * stageWeight) / 100;
            setProgress(Math.max(1, Math.min(90, Math.round(weighted * 0.9 + stageBase * 0.1))));

            if (clamped >= 100 && uploadFinishedMs === null) {
              uploadFinishedMs = performance.now();
              startProcessingTicker();
              return;
            }

            let etaPart = "";
            if (clamped >= 2 && elapsed >= 0.25) {
              const etaSeconds = (elapsed * (100 - clamped)) / clamped;
              if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
            }
            setStatus(`Uploading baby ZIP… ${clamped}%${etaPart}`);
          },
        });

        clearProcessingInterval();
        setPeople(resp.people);
        setBabyZipWarnings(resp.warnings ?? []);

        if (uploadFinishedMs !== null) {
          const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
          if (processingSeconds >= 0.25) {
            babyZipProcessingEstimateSecondsRef.current =
              0.7 * babyZipProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
          }
        }
      }

      setStatus("Processing complete");
      setProgress(100);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        setStatus("Processing cancelled");
      } else {
        console.error(err);
        setStatus("Processing failed");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      processingSnapshotRef.current = null;
    }
  };

  const handleStop = () => {
    if (!abortRef.current) return;

    const snap = processingSnapshotRef.current;
    abortRef.current.abort();

    if (snap) {
      setPeople(snap.people);
      onDefaultBabyFilename(snap.defaultBabyFilename);
      setBabyZipWarnings(snap.babyZipWarnings);
    }

    setLoading(false);
    abortRef.current = null;
    processingSnapshotRef.current = null;
    setStatus("Processing cancelled");
    setProgress(0);
  };

  return (
    <div className="mapping-layout">
      <div className="mapping-top">
        <div className="panel">
          <div className="stack">
            {insecureHttp && (
              <div className="callout warn">
                <div className="stack" style={{ gap: 8 }}>
                  <strong>
                    <span className="warn-icon" aria-hidden="true">⚠</span>
                    Warning: Unencrypted uploads (HTTP)
                  </strong>
                  <div className="muted small">
                    You are not on HTTPS. Photos may be visible to others on the network while uploading.
                    Use HTTPS or run on localhost if possible.
                  </div>
                  <ToggleSwitch
                    checked={allowInsecureUploads}
                    onChange={setAllowInsecureUploads}
                    label="I understand (continue over HTTP)"
                  />
                </div>
              </div>
            )}
            <p className="muted">
              Upload baby photos in two ways: (1) a ZIP to automatically match photos to students by filename, and (2) an optional default
              baby photo used when a student is missing one. Click <strong>Process</strong> to apply your selections. After processing, you can
              override per person (and click a thumbnail to crop to the template cutout).
            </p>

            <UploadDropLabel accept=".zip" disabled={loading} onFile={(file) => setBabyZip(file)}>
              <span>Baby photo ZIP (optional)</span>
              <input type="file" accept=".zip" onChange={(e) => setBabyZip(e.target.files?.[0] ?? null)} />
            </UploadDropLabel>

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Advanced name matching"
              description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
            />

            <ToggleSwitch
              disabled={!advancedNameMatch}
              checked={advancedNameMatch && partialNameMatch}
              onChange={setPartialNameMatch}
              label="Partial name matching"
              description="Helps with minor typos/missing characters."
            />

            <div className="stack" style={{ gap: 6 }}>
              <strong>Default baby photo (optional)</strong>
              <div className="muted small">Used when a student is missing a baby photo. Missing baby photos are allowed.</div>

              {workspaceId && defaultBabyFilename ? (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img
                    src={assetUrl(workspaceId, "baby", defaultBabyFilename)}
                    alt="default baby photo"
                    className="thumb thumb-baby"
                  />
                  <span className="muted small">Current default: {defaultBabyFilename}</span>
                </div>
              ) : (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img
                    src={withBase("assets/Default_Baby_Photo_ABC_Blocks.webp")}
                    alt="default baby photo (ABC blocks)"
                    className="thumb thumb-baby"
                  />
                  <span className="muted small">Current default: ABC blocks</span>
                </div>
              )}

              <UploadDropLabel accept="image/*" disabled={loading} onFile={(file) => setBabyFile(file)}>
                <span className="muted small">Upload default baby photo</span>
                <input type="file" accept="image/*" onChange={(e) => setBabyFile(e.target.files?.[0] ?? null)} />
              </UploadDropLabel>

              <div className="inline" style={{ gap: 10 }}>
                <button type="button" disabled={loading} onClick={() => setBabyFile(null)}>
                  Clear selection
                </button>
                <button type="button" disabled={loading} onClick={() => onDefaultBabyFilename(null)}>
                  Clear default
                </button>
              </div>
            </div>

            <ToggleSwitch
              checked={removeBabyBackground}
              onChange={setRemoveBabyBackground}
              label="Remove background from baby photos"
              description="When enabled, uploads are saved with a transparent background."
            />

            <div className="stack" style={{ gap: 8 }}>
              <ToggleSwitch
                checked={Boolean(babyBackgroundColor.trim())}
                onChange={(checked) => {
                  if (checked) {
                    const normalized = normalizeHexColor(babyBackgroundColor);
                    const trimmed = babyBackgroundColor.trim();
                    onBabyBackgroundColor(normalized ?? (trimmed ? trimmed : "#ffffff"));
                  } else {
                    onBabyBackgroundColor("");
                  }
                }}
                label="Baby photo background colour"
                description="If a baby image has transparent pixels, fill them with this colour during rendering."
              />

              {Boolean(babyBackgroundColor.trim()) && (
                <div className="field color-override" style={{ maxWidth: 360 }}>
                  <label htmlFor="babyBgColorText">Fill colour</label>
                  <div className="inline">
                    <input
                      type="color"
                      className="color-swatch"
                      aria-label="Baby background fill colour"
                      value={normalizeHexColor(babyBackgroundColor) ?? "#ffffff"}
                      onChange={(e) => onBabyBackgroundColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                    />
                    <input
                      id="babyBgColorText"
                      type="text"
                      placeholder="#ffffff"
                      value={babyBackgroundColor}
                      ref={babyBgHexInputRef}
                      onChange={(e) => onBabyBackgroundColor(e.target.value)}
                      onBlur={(e) => {
                        const normalized = normalizeHexColor(e.target.value);
                        if (normalized) onBabyBackgroundColor(normalized);
                      }}
                    />
                  </div>
                </div>
              )}

              {Boolean(babyBackgroundColor.trim()) && (
                <div className="inline" style={{ gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={!workspaceId || babyBgPickBusy}
                    onClick={async () => {
                      // Bring attention to the colour input.
                      babyBgHexInputRef.current?.focus();

                      if (!workspaceId) {
                        setStatus("Parse the template first");
                        return;
                      }
                      if (babyBgPickActive) {
                        setBabyBgPickActive(false);
                        if (babyBgPickUrl) URL.revokeObjectURL(babyBgPickUrl);
                        setBabyBgPickUrl(null);
                        return;
                      }

                      try {
                        setBabyBgPickBusy(true);
                        setStatus("Loading clean template…");
                        const resp = await fetch(`${templateCleanUrl(workspaceId)}&t=${Date.now()}`);
                        if (!resp.ok) throw new Error("Could not load clean template");
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        setBabyBgPickUrl(url);
                        setBabyBgPickActive(true);
                        setStatus("Click the template preview to pick a colour");
                      } catch (err) {
                        console.error(err);
                        setStatus("Could not load clean template");
                      } finally {
                        setBabyBgPickBusy(false);
                      }
                    }}
                  >
                    {babyBgPickActive ? "Close picker" : "Pick from template"}
                  </button>
                  <span className="muted small">Samples a pixel from the clean template and sets the fill colour.</span>
                </div>
              )}

              {babyBgPickActive && babyBgPickUrl && (
                <div className="stack" style={{ gap: 8 }}>
                  <img
                    className="template-pick"
                    src={babyBgPickUrl}
                    alt="Clean template (click to pick colour)"
                    onClick={(e) => {
                      const img = e.currentTarget;
                      const rect = img.getBoundingClientRect();
                      const rx = (e.clientX - rect.left) / Math.max(1, rect.width);
                      const ry = (e.clientY - rect.top) / Math.max(1, rect.height);
                      const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor(rx * img.naturalWidth)));
                      const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor(ry * img.naturalHeight)));

                      const canvas = document.createElement("canvas");
                      canvas.width = 1;
                      canvas.height = 1;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      ctx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
                      const data = ctx.getImageData(0, 0, 1, 1).data;
                      const hex = rgbToHex(data[0], data[1], data[2]);
                      onBabyBackgroundColor(hex);
                      setStatus(`Picked ${hex}`);
                    }}
                  />
                  <div className="muted small">Tip: click a background pixel, not a photo subject.</div>
                </div>
              )}
            </div>

            {removeBabyBackground && (
              <div className="stack" style={{ gap: 10 }}>
                <ToggleSwitch
                  checked={babyBackgroundMode === "simple"}
                  onChange={(checked) => {
                    if (checked) setBabyBackgroundMode("simple");
                  }}
                  label="Simple backgrounds"
                  description="Best for solid/mostly-solid backgrounds."
                />

                <ToggleSwitch
                  checked={babyBackgroundMode === "complex"}
                  onChange={(checked) => {
                    if (checked) setBabyBackgroundMode("complex");
                  }}
                  label="Complex backgrounds"
                  description="Best for real-life backgrounds (more intensive)."
                />

                <ToggleSwitch
                  checked={babyBackgroundMode === "ultra_complex"}
                  onChange={(checked) => {
                    if (checked) setBabyBackgroundMode("ultra_complex");
                  }}
                  label="Ultra complex backgrounds"
                  description="Highest quality (ML-based). First run may be slower."
                />
              </div>
            )}

            {babyZipWarnings.length > 0 && (
              <details className="muted small">
                <summary>
                  <strong>⚠ Baby ZIP warnings ({babyZipWarnings.length})</strong>
                </summary>
                <ul style={{ marginTop: 8 }}>
                  {babyZipWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="actions mapping-actions baby-process-actions">
              <button
                type="button"
                className="primary"
                onClick={loading ? handleStop : handleProcess}
                disabled={!loading && !babyFile && !babyZip}
              >
                {loading ? "Stop" : "Process"}
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="stack">
            <div className="actions mapping-actions">
              <button type="button" onClick={onBack}>
                Back
              </button>
              <button type="button" className="danger" onClick={onReset}>
                Reset all
              </button>
              <button className="primary" type="button" onClick={onContinue} disabled={!canContinue}>
                Continue
              </button>
            </div>
            {status && <p className="muted">{status}</p>}
            {loading && progress > 0 && <ProgressBar progress={progress} />}
          </div>
        </div>
      </div>

      <div className="panel">
        {workspaceId && people.length > 0 ? (
          <div className="people-grid">
            {people.map((p, idx) => {
              const babyFilename = p.baby_photo_filename || defaultBabyFilename;
              const quote = (p.quote ?? defaultQuote ?? "").trim();
              const canShowImage = Boolean(babyFilename) && !babyThumbError[p.index];
              const babyThumbStyle: React.CSSProperties = {
                ...(maskUrl ? ({ ["--baby-mask" as never]: `url(${maskUrl})` } as React.CSSProperties) : {}),
                width: babyThumbDims.width,
                height: babyThumbDims.height,
                backgroundColor: babyFillColor ?? undefined,
              };

              return (
                <div className="people-card" key={p.index}>
                  <div className="people-card-header">
                    <div className="stack" style={{ gap: 4 }}>
                      <div className="muted small">#{p.index}</div>
                      <div>
                        <strong>
                          {p.first_name} {p.last_name}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid two">
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="muted small">Mugshot</div>
                      <div className="thumb-cell">
                        {p.mugshot_filename && workspaceId ? (
                          <img
                            src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                            alt="portrait"
                            className="thumb"
                          />
                        ) : (
                          <div className="muted small">(missing)</div>
                        )}
                      </div>
                    </div>

                    <div className="stack" style={{ gap: 6 }}>
                      <div className="muted small">Baby photo</div>
                      <div className="thumb-cell">
                        {workspaceId && canShowImage ? (
                          <div
                            className={clsx("baby-thumb-editable", "baby-thumb-review", {
                              "baby-thumb-masked": Boolean(maskUrl),
                            })}
                            style={babyThumbStyle}
                            role="button"
                            tabIndex={0}
                            aria-label={`Edit baby photo for ${p.first_name} ${p.last_name}`}
                            onClick={() => openEditor(idx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openEditor(idx);
                              }
                            }}
                          >
                            <img
                              src={assetUrl(workspaceId, "baby", babyFilename!)}
                              alt="baby"
                              className="baby-thumb-img"
                              onError={() => setBabyThumbError((prev) => ({ ...prev, [p.index]: true }))}
                            />
                            <div className="baby-thumb-hover" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                                <path
                                  d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M14.06 6.19 16.81 8.94"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={clsx("baby-thumb-editable", "baby-thumb-review", "thumb-placeholder", {
                              "baby-thumb-masked": Boolean(maskUrl),
                            })}
                            style={babyThumbStyle}
                            role="button"
                            tabIndex={0}
                            aria-label={`Edit baby photo for ${p.first_name} ${p.last_name}`}
                            onClick={() => openEditor(idx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openEditor(idx);
                              }
                            }}
                          >
                            <img
                              src={withBase("assets/Default_Baby_Photo_ABC_Blocks.webp")}
                              alt=""
                              className="baby-thumb-img"
                              aria-hidden="true"
                            />
                            <div className="baby-thumb-hover" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                                <path
                                  d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M14.06 6.19 16.81 8.94"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="stack" style={{ gap: 6 }}>
                    <div className="muted small">Quote</div>
                    <div className={clsx({ muted: !p.quote })}>{quote || "(none)"}</div>
                  </div>

                  <UploadDropLabel accept="image/*" disabled={loading} onFile={(file) => handlePerPersonBaby(idx, file)}>
                    <span>Upload/replace baby photo (optional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePerPersonBaby(idx, e.target.files?.[0] ?? null)}
                    />
                    <div className="muted small">{p.baby_photo_filename ?? "No custom photo"}</div>
                  </UploadDropLabel>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No people loaded yet. Complete portrait mapping first.</p>
        )}
      </div>

      {workspaceId && editingIdx !== null && editingSrc && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit baby photo">
          <div className="modal">
            <div className="modal-header">
              <div className="stack" style={{ gap: 2 }}>
                <strong>Edit baby photo</strong>
                <div className="muted small">{editingName}</div>
              </div>
              <button type="button" onClick={closeEditor} disabled={editingBusy}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <div
                className="baby-editor-crop"
                ref={editorCropRef}
                style={{ aspectRatio: `${outSize.width} / ${outSize.height}`, backgroundColor: babyFillColor ?? undefined }}
              >
                <Cropper
                  image={editingSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropAspect}
                  cropSize={editorCropSize ?? undefined}
                  onCropChange={setCrop}
                  onZoomChange={(z) => {
                    setZoom(Math.max(0.5, Math.min(3, z)));
                    setDirtyEdits(true);
                  }}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                  objectFit="cover"
                  minZoom={0.5}
                  maxZoom={3}
                  restrictPosition={false}
                />
                {maskUrl && <img src={maskUrl} className="baby-editor-mask" alt="" aria-hidden="true" />}
              </div>

              <div className="grid two" style={{ alignItems: "end" }}>
                <label className="field">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.001}
                    value={zoom}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setZoom(Math.max(0.5, Math.min(3, v)));
                      setDirtyEdits(true);
                    }}
                    disabled={editingBusy}
                  />
                </label>
                <div className="actions" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCrop({ x: 0, y: 0 });
                      setDirtyEdits(true);
                    }}
                    disabled={editingBusy}
                  >
                    Center
                  </button>
                  <button type="button" onClick={() => applyEdits()} disabled={editingBusy}>
                    Apply changes
                  </button>
                  <div className="popover-anchor">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingBusy) return;
                        setRemoveBgMode(babyBackgroundMode);
                        setRemoveBgProgress(0);
                        setRemoveBgPopoverOpen((v) => !v);
                      }}
                      disabled={editingBusy}
                    >
                      Remove background
                    </button>

                    {removeBgPopoverOpen && (
                      <div className="popover" role="dialog" aria-label="Background removal options">
                        <div className="stack" style={{ gap: 10 }}>
                          <div className="stack" style={{ gap: 2 }}>
                            <strong>Background removal</strong>
                            <div className="muted small">Choose a mode, then remove.</div>
                          </div>

                          <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                            <input
                              type="radio"
                              name="baby-bg-mode"
                              checked={removeBgMode === "simple"}
                              onChange={() => setRemoveBgMode("simple")}
                              disabled={editingBusy}
                            />
                            <span>Simple</span>
                            <span className="muted small">(solid backgrounds)</span>
                          </label>

                          <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                            <input
                              type="radio"
                              name="baby-bg-mode"
                              checked={removeBgMode === "complex"}
                              onChange={() => setRemoveBgMode("complex")}
                              disabled={editingBusy}
                            />
                            <span>Complex</span>
                            <span className="muted small">(real-life backgrounds)</span>
                          </label>

                          <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                            <input
                              type="radio"
                              name="baby-bg-mode"
                              checked={removeBgMode === "ultra_complex"}
                              onChange={() => setRemoveBgMode("ultra_complex")}
                              disabled={editingBusy}
                            />
                            <span>Ultra complex</span>
                            <span className="muted small">(highest quality; heavier)</span>
                          </label>

                          <div className="actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void runBackgroundRemovalPreview()}
                              disabled={editingBusy}
                            >
                              Remove
                            </button>
                          </div>

                          {editingAction === "remove_background" && (
                            <div className="stack" style={{ gap: 6 }}>
                              <div className="inline" style={{ justifyContent: "space-between", gap: 10 }}>
                                <span className="muted small">{removeBgMessage || "Working…"}</span>
                                <span className="muted small">
                                  {removeBgEtaSeconds != null ? `ETA ${formatEtaSeconds(removeBgEtaSeconds)}` : ""}
                                </span>
                              </div>
                              <div className="progress determinate" aria-label="Background removal progress">
                                <div className="progress-bar determinate" style={{ width: `${removeBgProgress}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiscardWarning && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Discard baby photo edits">
          <div className="modal" style={{ width: "min(560px, 100%)" }}>
            <div className="modal-header">
              <div className="stack" style={{ gap: 2 }}>
                <strong>Discard changes?</strong>
                <div className="muted small">Closing now will discard all un-applied changes (including background removal).</div>
              </div>
              <button type="button" onClick={() => setShowDiscardWarning(false)} disabled={editingBusy}>
                Back
              </button>
            </div>
            <div className="modal-body">
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowDiscardWarning(false)} disabled={editingBusy}>
                  Keep editing
                </button>
                <button type="button" className="danger" onClick={discardAndCloseEditor} disabled={editingBusy}>
                  Discard and close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Styling({
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
  setAvailableFonts
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
      <p className="muted">Name and quote can be styled independently. Default size is 40pt. Font size bounds: 1–100.</p>

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
  onFontFamily
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

function Review({
  people,
  workspaceId,
  babyMaskBox,
  defaultBabyFilename,
  defaultQuote,
  swapMode,
  swapDisabled,
  onToggleSwapMode,
  perSpread,
  onSwapPositions
}: {
  people: PersonRecord[];
  workspaceId: string | null;
  babyMaskBox: Box | null;
  defaultBabyFilename: string | null;
  defaultQuote: string;
  swapMode: boolean;
  swapDisabled: boolean;
  onToggleSwapMode: () => void;
  perSpread: number;
  onSwapPositions: (a: number, b: number) => void;
}) {
  const maskUrl = workspaceId && babyMaskBox ? babyMaskUrl(workspaceId, babyMaskBox) : null;

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDrop = (targetIdx: number, evt: React.DragEvent<HTMLDivElement>) => {
    if (!swapMode) return;
    evt.preventDefault();
    const payload = evt.dataTransfer.getData("text/plain");
    const sourceIdx = dragIdx ?? Number(payload);
    if (Number.isNaN(sourceIdx) || sourceIdx == null || sourceIdx === targetIdx) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    onSwapPositions(sourceIdx, targetIdx);
    setDropTarget(null);
    setDragIdx(null);
  };

  return (
    <div className="stack">
      <div className="inline">
        <p className="muted">People grid (includes defaults for baby photo and quote).</p>
        <button
          type="button"
          className={clsx("chip", { active: swapMode })}
          onClick={onToggleSwapMode}
          disabled={swapDisabled}
        >
          {swapMode ? "Swap mode: on" : "Swap mode: off"}
        </button>
      </div>
      {swapDisabled && <p className="muted small">Disable “Force alphabetical” to reorder cards.</p>}
      {swapMode && (
        <p className="muted small">Drag a person card onto another to swap positions.</p>
      )}
      <div className="people-grid">
        {people.map((p, rowIdx) => {
          const positionInSpread = rowIdx % perSpread;
          const spreadNumber = Math.floor(rowIdx / perSpread) + 1;
          const slotNumber = positionInSpread + 1;
          const babyFilename = p.baby_photo_filename || defaultBabyFilename;
          const quote = (p.quote ?? defaultQuote ?? "").trim();
          const babyThumbStyle: React.CSSProperties | undefined = maskUrl
            ? ({ ["--baby-mask" as never]: `url(${maskUrl})` } as React.CSSProperties)
            : undefined;

          const cardClasses = clsx("people-card", {
            "swap-mode": swapMode,
            dragging: dragIdx === rowIdx,
            "swap-target": dropTarget === p.index && swapMode,
          });

          return (
            <div
              className={cardClasses}
              key={p.index}
              draggable={swapMode}
              onDragStart={(evt) => {
                if (!swapMode) return;
                setDragIdx(rowIdx);
                evt.dataTransfer.effectAllowed = "move";
                evt.dataTransfer.setData("text/plain", String(rowIdx));
              }}
              onDragOver={(evt) => {
                if (!swapMode) return;
                evt.preventDefault();
                setDropTarget(p.index);
              }}
              onDragLeave={() => swapMode && setDropTarget(null)}
              onDrop={(evt) => handleDrop(rowIdx, evt)}
            >
              <div className="people-card-header">
                <div className="stack" style={{ gap: 4 }}>
                  <div className="muted small">#{p.index}</div>
                  <div>
                    <strong>
                      {p.first_name} {p.last_name}
                    </strong>
                  </div>
                  <div className="muted small">Spread {spreadNumber} • Slot {slotNumber}</div>
                </div>
              </div>

              <div className="grid two">
                <div className="stack" style={{ gap: 6 }}>
                  <div className="muted small">Mugshot</div>
                  <div className="thumb-cell">
                    {p.mugshot_filename && workspaceId ? (
                      <img src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)} alt="portrait" className="thumb" />
                    ) : (
                      <div className="muted small">(missing)</div>
                    )}
                  </div>
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <div className="muted small">Baby photo</div>
                  <div className="thumb-cell">
                    {workspaceId && babyFilename ? (
                      <div
                        className={clsx("baby-thumb-editable", "baby-thumb-readonly", "baby-thumb-review", {
                          "baby-thumb-masked": Boolean(maskUrl),
                        })}
                        style={babyThumbStyle}
                      >
                        <img src={assetUrl(workspaceId, "baby", babyFilename)} alt="baby" className="baby-thumb-img" />
                      </div>
                    ) : (
                      <div className="muted small">(default/none)</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="stack" style={{ gap: 6 }}>
                <div className="muted small">Quote</div>
                <div className={clsx({ muted: !p.quote })}>{quote || "(none)"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Results({
  outputPath,
  outputPaths,
  workspaceId,
  outputNonce,
  usageInfo,
}: {
  outputPath: string | null;
  outputPaths: string[];
  workspaceId: string | null;
  outputNonce: number;
  usageInfo?: { remaining: number; limit: number; period: "month" | "lifetime" } | null;
}) {
  if (!workspaceId) return <p className="muted">Missing workspace.</p>;
  const rawFiles = (outputPaths && outputPaths.length ? outputPaths : outputPath ? [outputPath] : [])
    .map((p) => p.split(/[\\/]/).pop() || p)
    .filter(Boolean);
  const parseSpreadNumber = (fname: string) => {
    const m = fname.match(/output_(\d+)\.png$/i);
    return m ? Number(m[1]) : null;
  };
  const files = [...rawFiles].sort((a, b) => {
    const an = parseSpreadNumber(a);
    const bn = parseSpreadNumber(b);
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1;
    if (bn != null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  if (!files.length) return <p className="muted">No output generated yet.</p>;

  return (
    <div className="stack">
      {usageInfo && typeof usageInfo.remaining === "number" && typeof usageInfo.limit === "number" ? (
        <div className="callout">
          <div className="stack" style={{ gap: 4 }}>
            <strong>License usage</strong>
            <div className="muted small">
              Uses remaining{usageInfo.period === "month" ? " this month" : ""}: <strong>{usageInfo.remaining}</strong> of {usageInfo.limit}
            </div>
          </div>
        </div>
      ) : null}

      <div className="callout">
        <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
          <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              Rendered spreads: <strong>{files.length}</strong>
            </div>
            <span className="muted small">(chronological order)</span>
          </div>
          <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="primary"
              onClick={() => {
                window.open(generationDownloadAllUrl(workspaceId), "_blank");
              }}
            >
              Download all spreads
            </button>
            <button
              onClick={() => {
                window.open(generationDownloadSpreadsheetUrl(workspaceId), "_blank");
              }}
            >
              Download spreadsheet
            </button>
          </div>
        </div>
      </div>

      {files.map((fname, idx) => {
        const spreadNumber = parseSpreadNumber(fname) ?? idx + 1;
        return (
          <div key={fname} className="stack" style={{ gap: 8 }}>
            <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
              <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
                <strong>Spread {spreadNumber}</strong>
                <span className="muted">{fname}</span>
              </div>
              <button
                onClick={() => {
                  window.open(generationDownloadUrl(workspaceId, fname), "_blank");
                }}
              >
                Download
              </button>
            </div>
            <img
              src={generationDownloadUrl(workspaceId, fname, { cache: `${outputNonce}-${idx}` })}
              alt={`spread-${spreadNumber}`}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12 }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SlotEditor({ slots, onChange, onSelectSlot, selectedSlot, parsedSlots, onResetToParsed }: { slots: TemplateSlots[]; onChange: (s: TemplateSlots[]) => void; onSelectSlot?: (idx: number) => void; selectedSlot?: number | null; parsedSlots?: TemplateSlots[]; onResetToParsed?: () => void }) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  if (!slots.length) return null;

  const update = (slotIdx: number, key: keyof TemplateSlots, field: keyof Box, value: number) => {
    const next = slots.map((slot, i) => {
      if (i !== slotIdx) return slot;
      const targetBox = { ...slot[key], [field]: value } as Box;
      return { ...slot, [key]: targetBox } as TemplateSlots;
    });
    onChange(next);
  };

  const parts: (keyof TemplateSlots)[] = ["mugshot", "baby_photo", "name", "quote"];
  const partLabels: Record<keyof TemplateSlots, string> = { mugshot: "Portrait", baby_photo: "Baby", name: "Name", quote: "Quote" };

  const toggleExpand = (idx: number) => {
    setExpandedSlot(expandedSlot === idx ? null : idx);
    onSelectSlot?.(idx);
  };

  return (
    <div className="slot-editor-table">
      <div className="slot-editor-header">
        <span className="muted small">Click row to expand. {slots.length} slots detected.</span>
        {parsedSlots && parsedSlots.length > 0 && onResetToParsed && (
          <button type="button" className="chip small danger" onClick={onResetToParsed}>
            ↺ Reset to parsed
          </button>
        )}
      </div>
      <table className="slot-table">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Slot</th>
            <th>Type</th>
            <th>X</th>
            <th>Y</th>
            <th>W×H</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, idx) => {
            const isExpanded = expandedSlot === idx;
            const isActive = selectedSlot === idx;
            return (
              <Fragment key={idx}>
                <tr
                  className={clsx("slot-row-main", { active: isActive, expanded: isExpanded })}
                  onClick={() => toggleExpand(idx)}
                >
                  <td className="expand-cell">{isExpanded ? "▾" : "▸"}</td>
                  <td className="slot-num-cell">#{idx + 1}</td>
                  <td colSpan={4} className="slot-summary-cell">
                    {isExpanded ? "" : `${slot.mugshot.width}×${slot.mugshot.height} @ (${slot.mugshot.x}, ${slot.mugshot.y})`}
                  </td>
                </tr>
                {isExpanded && parts.map((part) => (
                  <tr key={`${idx}-${part}`} className="slot-detail-row">
                    <td></td>
                    <td></td>
                    <td className="part-label-cell">{partLabels[part]}</td>
                    <td>
                      <input
                        type="number"
                        value={slot[part].x}
                        onChange={(e) => update(idx, part, "x", Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={slot[part].y}
                        onChange={(e) => update(idx, part, "y", Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="size-cell">
                      <input
                        type="number"
                        value={slot[part].width}
                        onChange={(e) => update(idx, part, "width", Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>×</span>
                      <input
                        type="number"
                        value={slot[part].height}
                        onChange={(e) => update(idx, part, "height", Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TemplatePreview({
  slots,
  size,
  backgroundUrl,
  selectedSlot,
  onSelectSlot,
  onUpdate
}: {
  slots: TemplateSlots[];
  size: { width: number; height: number } | null;
  backgroundUrl?: string | null;
  selectedSlot?: number | null;
  onSelectSlot?: (idx: number) => void;
  onUpdate?: (slots: TemplateSlots[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    slotIdx: number;
    part: keyof TemplateSlots;
    mode: "move" | "resize";
    handle?: "nw" | "ne" | "sw" | "se";
    startBox: Box;
    origin: { x: number; y: number };
  } | null>(null);

  if (!size || !slots.length) {
    return <div className="canvas">Upload templates to see regions.</div>;
  }

  const aspect = size.width / size.height;
  const viewW = 720;
  const viewH = Math.round(viewW / aspect);

  const clientToSvg = (evt: React.MouseEvent<SVGElement, MouseEvent>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = size.width / rect.width;
    const scaleY = size.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  };

  const updateSlot = (slotIdx: number, part: keyof TemplateSlots, updater: (b: Box) => Box) => {
    if (!onUpdate) return;
    const next = slots.map((slot, i) => {
      if (i !== slotIdx) return slot;
      return { ...slot, [part]: updater(slot[part]) } as TemplateSlots;
    });
    onUpdate(next);
  };

  const onMouseDown = (
    evt: React.MouseEvent<SVGRectElement | SVGCircleElement, MouseEvent>,
    slotIdx: number,
    part: keyof TemplateSlots,
    mode: "move" | "resize",
    handle?: "nw" | "ne" | "sw" | "se"
  ) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (onSelectSlot) onSelectSlot(slotIdx);
    const point = clientToSvg(evt);
    setDrag({ slotIdx, part, mode, handle, startBox: { ...slots[slotIdx][part] }, origin: point });
  };

  const onMouseMove = (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!drag) return;
    evt.preventDefault();
    const point = clientToSvg(evt);
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    updateSlot(drag.slotIdx, drag.part, (box) => {
      if (drag.mode === "move") {
        return { ...box, x: Math.max(0, drag.startBox.x + dx), y: Math.max(0, drag.startBox.y + dy) };
      }
      let { x, y, width, height } = drag.startBox;
      const minSize = 10;
      switch (drag.handle) {
        case "nw":
          x = drag.startBox.x + dx;
          y = drag.startBox.y + dy;
          width = drag.startBox.width - dx;
          height = drag.startBox.height - dy;
          break;
        case "ne":
          y = drag.startBox.y + dy;
          width = drag.startBox.width + dx;
          height = drag.startBox.height - dy;
          break;
        case "sw":
          x = drag.startBox.x + dx;
          width = drag.startBox.width - dx;
          height = drag.startBox.height + dy;
          break;
        case "se":
        default:
          width = drag.startBox.width + dx;
          height = drag.startBox.height + dy;
          break;
      }
      return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.max(minSize, Math.round(width)),
        height: Math.max(minSize, Math.round(height)),
      };
    });
  };

  const onMouseUp = () => setDrag(null);

  const renderHandles = (slotIdx: number, part: keyof TemplateSlots, box: Box) => {
    const handles: ("nw" | "ne" | "sw" | "se")[] = ["nw", "ne", "sw", "se"];
    const coords = {
      nw: { cx: box.x, cy: box.y },
      ne: { cx: box.x + box.width, cy: box.y },
      sw: { cx: box.x, cy: box.y + box.height },
      se: { cx: box.x + box.width, cy: box.y + box.height },
    } as const;
    return handles.map((h) => (
      <circle
        key={`${part}-${h}`}
        cx={coords[h].cx}
        cy={coords[h].cy}
        r={8}
        fill="#0ea5e9"
        stroke="#0f172a"
        strokeWidth={1.5}
        onMouseDown={(evt) => onMouseDown(evt, slotIdx, part, "resize", h)}
      />
    ));
  };

  return (
    <div className="canvas" style={{ position: "relative", padding: 0, height: viewH, width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 10 }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {backgroundUrl && (
          <image
            href={backgroundUrl}
            width={size.width}
            height={size.height}
            opacity={1}
            style={{ pointerEvents: "none" }}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {slots.map((slot, i) => {
          const isSelected = selectedSlot === i;
          return (
            <g key={i}>
              {(["mugshot", "baby_photo", "name", "quote"] as (keyof TemplateSlots)[]).map((part) => (
                <g key={part}>
                  <rect
                    {...rectProps(slot[part], getStroke(part), `${part}-${i + 1}`, isSelected)}
                    onMouseDown={(evt) => onMouseDown(evt, i, part, "move")}
                    cursor="move"
                  />
                  {renderHandles(i, part, slot[part])}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getStroke(part: keyof TemplateSlots) {
  switch (part) {
    case "mugshot":
      return "#22c55e";
    case "baby_photo":
      return "#3b82f6";
    case "name":
      return "#f97316"; // orange
    case "quote":
    default:
      return "#ff3131"; // red
  }
}

function rectProps(box: Box, strokeColor: string, label: string, isSelected: boolean) {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rx: 6,
    ry: 6,
    fill: isSelected ? "rgba(14,165,233,0.14)" : "rgba(15,23,42,0.06)",
    stroke: isSelected ? "#0ea5e9" : strokeColor,
    strokeWidth: isSelected ? 3 : 2,
    opacity: isSelected ? 1 : 0.95,
    ["data-label"]: label,
    style: isSelected
      ? { filter: "drop-shadow(0 0 14px rgba(56,189,248,0.95))", transition: "all 120ms ease" }
      : { transition: "all 120ms ease" }
  } as const;
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}
