import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Area } from "react-easy-crop";
import { useLocation, useSearchParams } from "react-router-dom";
import { withBase } from "./baseUrl";
import {
  applyMapping,
  generateSpread,
  ingestSpreadsheet,
  parseTemplate,
  uploadImage,
  uploadImageAs,
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
  detectFaceCenter,
  type BackgroundMode,
  type Box,
  type PersonRecord,
  type TemplateSlots,
  type RawParseDebug
} from "./api";
import {
  type ConfigFileV1,
  type MissingAsset,
  downloadJson,
  readConfigFile,
  safeIsoForFilename,
  describeApiError,
  formatServerMessage,
} from "./configFile";
import {
  computeImportNeeds,
  computeMissingAssets as computeMissingAssetsRemote,
  importTemplate as importTemplateRemote,
  importPortraits as importPortraitsRemote,
  importBabyZip as importBabyZipRemote,
  uploadMissingAsset as uploadMissingAssetRemote,
} from "./configImport";

import { ToggleSwitch } from "./components/ToggleSwitch";
import { UploadDropLabel } from "./components/UploadDropLabel";
import { FontPick } from "./components/FontPick";
import { ProgressBar } from "./components/ProgressBar";
import { SlotEditor } from "./components/SlotEditor";
import { TemplatePreview } from "./components/TemplatePreview";
import { ToolMessages, type ToolMessage } from "./components/ToolMessages";
import { cropToPngBlob } from "./utils/image";
import { groupSlotsByProximity } from "./utils/slots";
import { formatEtaSeconds, prefixServerMessage, scrollPastTopBar } from "./utils/ui";

import {
  clearSession,
  isPersistedSessionV1,
  parseStepFromSearch,
  SESSION_KEY,
  tryLoadSession,
  trySaveSession,
  type PersistedSessionV1,
} from "./session";

import type { Align, FontWeight, PlacementMode } from "./types";

import { TemplateParsing as TemplateParsingStep } from "./steps/TemplateParsing";
import { MugshotMapping as MugshotMappingStep } from "./steps/MugshotMapping";
import { QuotesStep as QuotesStepStep } from "./steps/QuotesStep";
import { BabyPhotosStep as BabyPhotosStepStep } from "./steps/BabyPhotosStep";
import { StylingStep } from "./steps/StylingStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ResultsStep } from "./steps/ResultsStep";
import { ParsingReview } from "./steps/ParsingReview";
import { RenderPreflight } from "./steps/RenderPreflight";

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

  // Persisted options for deterministic template parsing across refresh/config import.
  const [parseMugshotColor, setParseMugshotColor] = useState<string>("");
  const [parseBabyColor, setParseBabyColor] = useState<string>("");
  const [parseNameColor, setParseNameColor] = useState<string>("");
  const [parseQuoteColor, setParseQuoteColor] = useState<string>("");
  const [parseMinArea, setParseMinArea] = useState<number>(800);

  const [slots, setSlots] = useState<TemplateSlots[]>([]);
  const [templateSize, setTemplateSize] = useState<{ width: number; height: number } | null>(null);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [originalPeople, setOriginalPeople] = useState<PersonRecord[] | null>(null);

  const setPeopleSorted = (next: PersonRecord[]) => {
    // Preserve the user's chosen order. Alphabetical ordering (when desired)
    // is handled explicitly in the Review step / generation settings.
    setPeople(next);
  };

  const [slotAssignments, setSlotAssignments] = useState<Record<number, number>>({});
  const [defaultQuote, setDefaultQuote] = useState("404 quote not found");
  const [quotesWarnings, setQuotesWarnings] = useState<string[]>([]);
  const [quotesWarningsOpen, setQuotesWarningsOpen] = useState(false);
  const [quotesCompletedErrorCount, setQuotesCompletedErrorCount] = useState<number | null>(null);
  const [defaultBabyFilename, setDefaultBabyFilename] = useState<string | null>(null);
  const [babyZipWarnings, setBabyZipWarnings] = useState<string[]>([]);
  const [babyZipWarningsOpen, setBabyZipWarningsOpen] = useState(false);
  const [babyCompletedErrorCount, setBabyCompletedErrorCount] = useState<number | null>(null);
  const [portraitWarnings, setPortraitWarnings] = useState<string[]>([]);
  const [portraitWarningsOpen, setPortraitWarningsOpen] = useState(false);
  const [portraitCompletedErrorCount, setPortraitCompletedErrorCount] = useState<number | null>(null);
  const [babyIngest, setBabyIngest] = useState<NonNullable<PersistedSessionV1["babyIngest"]>>({
    advancedNameMatch: true,
    partialNameMatch: true,
    removeBackground: false,
    backgroundMode: "simple",
    allowInsecureUploads: false,
  });
  const [babyEditHistory, setBabyEditHistory] = useState<NonNullable<PersistedSessionV1["babyEditHistory"]>>([]);
  const [babyBackgroundColor, setBabyBackgroundColor] = useState<string>("");
  const [centerBabyOnFace, setCenterBabyOnFace] = useState(false);
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
  const [dismissedToolMessageIds, setDismissedToolMessageIds] = useState<Record<string, true>>({});
  const [showSaveConfigReminder, setShowSaveConfigReminder] = useState(false);
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
  const [outputFormat, setOutputFormat] = useState<"png" | "pdf" | "tiff">("png");
  const [outputSize, setOutputSize] = useState<{ width: number; height: number } | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("left_then_right");
  const [forceAlphabetical, setForceAlphabetical] = useState(false);
  const [rawDebug, setRawDebug] = useState<RawParseDebug | null>(null);
  const [parsedSlots, setParsedSlots] = useState<TemplateSlots[]>([]);

  useEffect(() => {
    if (!templateSize) {
      if (outputSize) setOutputSize(null);
      return;
    }
    if (!outputSize) return;

    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const maxW = Math.max(1, Math.round(templateSize.width));
    const maxH = Math.max(1, Math.round(templateSize.height));

    // Keep aspect ratio aligned with the template by anchoring to width.
    let w = clamp(Math.round(outputSize.width), 1, maxW);
    let h = clamp(Math.round((w * maxH) / maxW), 1, maxH);
    if (h > maxH) {
      h = maxH;
      w = clamp(Math.round((h * maxW) / maxH), 1, maxW);
    }

    if (w !== outputSize.width || h !== outputSize.height) setOutputSize({ width: w, height: h });
  }, [templateSize, outputSize]);

  // Persisted options for spreadsheet+portrait ingest.
  const defaultNamingPattern = "\\d{3,4}";
  const [namingPattern, setNamingPattern] = useState<string>(defaultNamingPattern);
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [allowInsecureUploads, setAllowInsecureUploads] = useState(false);

  // Config export/import UI state.
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configImportBusy, setConfigImportBusy] = useState(false);
  const [configImportStatus, setConfigImportStatus] = useState<string>("");
  const [configImportError, setConfigImportError] = useState<string>("");
  const [configToImport, setConfigToImport] = useState<ConfigFileV1<PersistedSessionV1> | null>(null);
  const [importAnnotated, setImportAnnotated] = useState<File | null>(null);
  const [importClean, setImportClean] = useState<File | null>(null);
  const [importSpreadsheet, setImportSpreadsheet] = useState<File | null>(null);
  const [importMugshotsZip, setImportMugshotsZip] = useState<File | null>(null);
  const [importBabyZip, setImportBabyZip] = useState<File | null>(null);
  const [importWorkspaceId, setImportWorkspaceId] = useState<string | null>(null);
  const [importTemplateDone, setImportTemplateDone] = useState(false);
  const [importPortraitsDone, setImportPortraitsDone] = useState(false);
  const [importBabyDone, setImportBabyDone] = useState(false);
  const [importFinalized, setImportFinalized] = useState(false);
  const [missingAsset, setMissingAsset] = useState<MissingAsset | null>(null);

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

  // Quotes/baby photos can be disabled entirely; in that case we skip parsing those slots
  // and also skip the related steps.
  const isStepSkipped = (stepIndex: number) => {
    if (stepIndex === 3) return Boolean(skipQuotes);
    if (stepIndex === 4) return Boolean(skipBabyPhotos);
    return false;
  };

  const clampStep = (n: number) => Math.max(0, Math.min(steps.length - 1, n));

  const nearestNonSkipped = (target: number, direction: 1 | -1) => {
    let t = clampStep(target);
    for (let i = 0; i < steps.length; i++) {
      if (!isStepSkipped(t)) return t;
      t = clampStep(t + direction);
    }
    return clampStep(target);
  };

  const nextStepFrom = (from: number) => {
    if (from === 2) {
      if (skipQuotes) return skipBabyPhotos ? 5 : 4;
      return 3;
    }
    if (from === 3) return skipBabyPhotos ? 5 : 4;
    return nearestNonSkipped(from + 1, 1);
  };

  const prevStepFrom = (from: number) => {
    if (from === 5) {
      if (skipBabyPhotos) return skipQuotes ? 2 : 3;
      return 4;
    }
    if (from === 4) return skipQuotes ? 2 : 3;
    return nearestNonSkipped(from - 1, -1);
  };

  const stepReady = (stepIndex: number) => {
    if (isStepSkipped(stepIndex)) return false;
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
      // If the user tries to jump to a disabled step, redirect to the nearest available step.
      const direction: 1 | -1 = target >= activeStep ? 1 : -1;
      target = nearestNonSkipped(target, direction);
    }
    if (!stepReady(target)) {
      setStatus("Complete the previous steps before jumping ahead");
      return;
    }
    setActiveStep(target);
  };

  useEffect(() => {
    if (!isStepSkipped(activeStep)) return;
    setActiveStep(nearestNonSkipped(activeStep, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, skipBabyPhotos, skipQuotes]);

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
    setParseMugshotColor("");
    setParseBabyColor("");
    setParseNameColor("");
    setParseQuoteColor("");
    setParseMinArea(800);
    setSlots([]);
    setParsedSlots([]);
    setTemplateSize(null);
    setNamingPattern(defaultNamingPattern);
    setAdvancedNameMatch(true);
    setAllowInsecureUploads(false);
    setPeople([]);
    setSlotAssignments({});
    setDefaultQuote("404 quote not found");
    setDefaultBabyFilename(null);
    setBabyIngest({
      advancedNameMatch: true,
      partialNameMatch: true,
      removeBackground: false,
      backgroundMode: "simple",
      allowInsecureUploads: false,
    });
    setBabyEditHistory([]);
    setBabyBackgroundColor("");
    setCenterBabyOnFace(false);
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

  const buildSessionPayload = (): PersistedSessionV1 => {
    return {
      v: 1,
      activeStep,
      workspaceId,
      templateId,
      skipQuotes,
      skipBabyPhotos,
      templateParse: {
        mugshotColor: parseMugshotColor,
        babyColor: parseBabyColor,
        nameColor: parseNameColor,
        quoteColor: parseQuoteColor,
        minArea: parseMinArea,
      },
      slots,
      parsedSlots,
      templateSize,
      portraitsIngest: {
        namingPattern,
        advancedNameMatch,
        allowInsecureUploads,
      },
      people,
      slotAssignments,
      placementMode,
      forceAlphabetical,
      defaultQuote,
      defaultBabyFilename,
      babyIngest: { ...babyIngest, allowInsecureUploads },
      babyEditHistory,
      babyBackgroundColor,
      centerBabyOnFace,
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
  };

  const handleSaveConfig = () => {
    const cfg: ConfigFileV1<PersistedSessionV1> = {
      v: 1,
      kind: "ymga_config",
      created_at: new Date().toISOString(),
      session: buildSessionPayload(),
    };
    const name = `ymga_config_${safeIsoForFilename(new Date())}.json`;
    downloadJson(name, cfg);
    setStatus("Saved configuration file");
  };

  const resetImportUi = () => {
    setConfigImportBusy(false);
    setConfigImportStatus("");
    setConfigImportError("");
    setConfigToImport(null);
    setImportAnnotated(null);
    setImportClean(null);
    setImportSpreadsheet(null);
    setImportMugshotsZip(null);
    setImportBabyZip(null);
    setImportWorkspaceId(null);
    setImportTemplateDone(false);
    setImportPortraitsDone(false);
    setImportBabyDone(false);
    setImportFinalized(false);
    setMissingAsset(null);
  };

  const openConfigImport = () => {
    resetImportUi();
    setShowConfigModal(true);
  };

  const applyImportedSession = (session: PersistedSessionV1, newWorkspaceId: string) => {
    // Restore the saved state, but always bind it to the newly created workspace.
    setWorkspaceId(newWorkspaceId);
    setTemplateId(newWorkspaceId);
    setSkipQuotes(Boolean(session.skipQuotes));
    setSkipBabyPhotos(Boolean(session.skipBabyPhotos));
    setParseMugshotColor(session.templateParse?.mugshotColor ?? "");
    setParseBabyColor(session.templateParse?.babyColor ?? "");
    setParseNameColor(session.templateParse?.nameColor ?? "");
    setParseQuoteColor(session.templateParse?.quoteColor ?? "");
    setParseMinArea(typeof session.templateParse?.minArea === "number" ? Math.max(400, session.templateParse!.minArea) : 800);
    setNamingPattern(session.portraitsIngest?.namingPattern ?? defaultNamingPattern);
    setAdvancedNameMatch(Boolean(session.portraitsIngest?.advancedNameMatch ?? true));
    setAllowInsecureUploads(Boolean(session.portraitsIngest?.allowInsecureUploads));

    setSlots(session.slots ?? []);
    setParsedSlots(session.parsedSlots ?? []);
    setTemplateSize(session.templateSize ?? null);
    setPeople(session.people ?? []);
    setSlotAssignments(session.slotAssignments ?? {});
    setPlacementMode((session.placementMode as PlacementMode) ?? "left_then_right");
    setForceAlphabetical(Boolean(session.forceAlphabetical));
    setDefaultQuote(session.defaultQuote ?? "404 quote not found");
    setDefaultBabyFilename(session.defaultBabyFilename ?? null);
    setBabyIngest({
      advancedNameMatch: Boolean(session.babyIngest?.advancedNameMatch ?? true),
      partialNameMatch: Boolean(session.babyIngest?.partialNameMatch ?? true),
      removeBackground: Boolean(session.babyIngest?.removeBackground ?? false),
      backgroundMode: (session.babyIngest?.backgroundMode as BackgroundMode) ?? "simple",
      allowInsecureUploads: Boolean(session.babyIngest?.allowInsecureUploads ?? false),
    });
    setBabyEditHistory((session.babyEditHistory ?? []) as any);
    setBabyBackgroundColor(session.babyBackgroundColor ?? "");
    setCenterBabyOnFace(Boolean(session.centerBabyOnFace));
    setDefaultMugshotFilename(session.defaultMugshotFilename ?? null);
    setNameFontFamily(session.nameFontFamily ?? "Inter, system-ui, sans-serif");
    setNameFontWeight((session.nameFontWeight as FontWeight) ?? "normal");
    setNameFontSize(typeof session.nameFontSize === "number" ? session.nameFontSize : 40);
    setNameAllCaps(Boolean(session.nameAllCaps));
    setNameAlign((session.nameAlign as Align) ?? "left");
    setQuoteFontFamily(session.quoteFontFamily ?? "Inter, system-ui, sans-serif");
    setQuoteFontWeight((session.quoteFontWeight as FontWeight) ?? "normal");
    setQuoteFontSize(typeof session.quoteFontSize === "number" ? session.quoteFontSize : 40);
    setQuoteAllCaps(Boolean(session.quoteAllCaps));
    setQuoteAlign((session.quoteAlign as Align) ?? "left");
    setPeoplePerSpread(typeof session.peoplePerSpread === "number" ? session.peoplePerSpread : 16);

    setTemplatePreviewUrl(`${templateCleanUrl(newWorkspaceId)}&t=${Date.now()}`);
    setAnnotatedPreviewUrl(`${templateAnnotatedUrl(newWorkspaceId)}&t=${Date.now()}`);
    setCleanPreviewUrl(`${templateCleanUrl(newWorkspaceId)}&t=${Date.now()}`);

    setActiveStep(Math.max(0, Math.min(7, session.activeStep ?? 0)));
  };

  const computeMissingAssets = async (session: PersistedSessionV1, ws: string): Promise<MissingAsset | null> => {
    const missing = await computeMissingAssetsRemote(session, ws, (w, k, f) => assetUrl(w, k, f));
    setMissingAsset(missing);
    return missing;
  };

  const clearMissingDefaultsForImport = async (session: PersistedSessionV1, ws: string) => {
    const exists = async (kind: "baby" | "mugshot", filename: string): Promise<boolean> => {
      try {
        const resp = await fetch(assetUrl(ws, kind, filename), { method: "GET" });
        return resp.ok;
      } catch {
        return false;
      }
    };

    if (session.defaultBabyFilename) {
      const f = String(session.defaultBabyFilename);
      if (!(await exists("baby", f))) session.defaultBabyFilename = null;
    }
    if (session.defaultMugshotFilename) {
      const f = String(session.defaultMugshotFilename);
      if (!(await exists("mugshot", f))) session.defaultMugshotFilename = null;
    }
  };

  const handleConfigSelected = async (file: File) => {
    setConfigImportError("");
    setConfigImportStatus("Reading configuration…");
    setConfigImportBusy(true);
    try {
      const cfg = await readConfigFile<PersistedSessionV1>(file, isPersistedSessionV1);
      setConfigToImport(cfg);
      setConfigImportStatus("Config loaded. Upload the annotated template to begin.");
    } catch (err) {
      setConfigImportError(`Could not read config.\n${formatServerMessage(err)}`);
      setConfigImportStatus("");
    } finally {
      setConfigImportBusy(false);
    }
  };

  const runImportTemplateIfReady = async (annotatedOverride?: File | null, cleanOverride?: File | null) => {
    if (!configToImport?.session) return;
    const annotated = annotatedOverride ?? importAnnotated;
    const clean = cleanOverride ?? importClean;
    if (!annotated || !clean) return;
    setConfigImportError("");
    setConfigImportBusy(true);
    try {
      const s = configToImport.session;
      const newWs = await importTemplateRemote({
        session: s,
        annotated,
        clean,
        parseTemplate,
        setStatus: setConfigImportStatus,
      });

      // Bind everything to the new workspace.
      setImportWorkspaceId(newWs);
      setImportTemplateDone(true);

      // Apply config session immediately (so the user lands back on their stage).
      applyImportedSession(s, newWs);
    } catch (err) {
      setConfigImportError(`Template parsing failed.\n${formatServerMessage(err)}`);
      setConfigImportStatus("");
      setImportTemplateDone(false);
      setImportWorkspaceId(null);
    } finally {
      setConfigImportBusy(false);
    }
  };

  const runImportPortraitsIfReady = async (sheetOverride?: File | null, zipOverride?: File | null) => {
    if (!configToImport?.session) return;
    if (!importWorkspaceId) return;
    const sheet = sheetOverride ?? importSpreadsheet;
    const zip = zipOverride ?? importMugshotsZip;
    if (!sheet || !zip) return;
    setConfigImportError("");
    setConfigImportBusy(true);
    try {
      const s = configToImport.session;
      await importPortraitsRemote({
        session: s,
        workspaceId: importWorkspaceId,
        spreadsheet: sheet,
        portraitsZip: zip,
        ingestSpreadsheet,
        setStatus: setConfigImportStatus,
      });

      // Use the config's canonical people (includes mapping adjustments).
      setPeople(s.people ?? []);

      setImportPortraitsDone(true);
    } catch (err) {
      setConfigImportError(`Portrait ingest failed.\n${formatServerMessage(err)}`);
      setConfigImportStatus("");
      setImportPortraitsDone(false);
    } finally {
      setConfigImportBusy(false);
    }
  };

  const runImportBabyZipIfReady = async (babyZipOverride?: File | null) => {
    if (!configToImport?.session) return;
    if (!importWorkspaceId) return;
    const babyZip = babyZipOverride ?? importBabyZip;
    if (!babyZip) return;
    setConfigImportError("");
    setConfigImportBusy(true);
    try {
      const s = configToImport.session;
      await importBabyZipRemote({
        session: s,
        workspaceId: importWorkspaceId,
        babyZip,
        uploadBabyZip,
        setStatus: setConfigImportStatus,
      });
      // Keep the config's people assignments.
      setPeople(s.people ?? []);
      setImportBabyDone(true);
    } catch (err) {
      setConfigImportError(`Baby zip ingest failed.\n${formatServerMessage(err)}`);
      setConfigImportStatus("");
      setImportBabyDone(false);
    } finally {
      setConfigImportBusy(false);
    }
  };

  const replayBabyEditsIfNeeded = async (session: PersistedSessionV1, ws: string) => {
    const history = (session.babyEditHistory ?? []).filter((h) => h && h.kind === "baby");
    if (!history.length) return;

    const requestedOutputs = new Set<string>();
    for (const p of session.people ?? []) {
      if (p?.baby_photo_filename) requestedOutputs.add(String(p.baby_photo_filename));
    }
    if (session.defaultBabyFilename) requestedOutputs.add(String(session.defaultBabyFilename));
    if (!requestedOutputs.size) return;

    // Only replay operations that are needed to materialize currently-referenced filenames.
    const neededFilenames = new Set<string>(requestedOutputs);
    const neededOps = new Set<number>();
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (neededFilenames.has(h.output_filename)) {
        neededOps.add(i);
        neededFilenames.add(h.input_filename);
      }
    }
    if (!neededOps.size) return;

    const exists = async (filename: string): Promise<boolean> => {
      try {
        const resp = await fetch(assetUrl(ws, "baby", filename), { method: "GET" });
        return resp.ok;
      } catch {
        return false;
      }
    };

    const fetchAssetBlob = async (filename: string): Promise<Blob> => {
      const resp = await fetch(assetUrl(ws, "baby", filename));
      if (!resp.ok) throw new Error(`Missing baby asset '${filename}'`);
      return await resp.blob();
    };

    for (let i = 0; i < history.length; i++) {
      if (!neededOps.has(i)) continue;
      const h = history[i];

      if (await exists(h.output_filename)) continue;

      setConfigImportStatus(`Restoring baby edits (${i + 1}/${history.length})…`);

      let sourceBlob: Blob;
      if (h.used_background_preview && h.used_background_preview.background_mode) {
        const { job_id } = await startRemoveBackgroundPreviewJob({
          workspaceId: ws,
          kind: "baby",
          filename: h.input_filename,
          backgroundMode: h.used_background_preview.background_mode,
          force: Boolean(h.used_background_preview.force),
        });

        const start = Date.now();
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 250));
          // eslint-disable-next-line no-await-in-loop
          const s = await removeBackgroundPreviewStatus(job_id);
          if (s.status === "done") {
            if (s.already_removed) {
              // Fall back to the original asset if the server says it's already removed.
              sourceBlob = await fetchAssetBlob(h.input_filename);
            } else {
              // eslint-disable-next-line no-await-in-loop
              sourceBlob = await fetchRemoveBackgroundPreviewResult(job_id);
            }
            break;
          }
          if (s.status === "error") throw new Error(s.error || "Background removal failed");
          if (Date.now() - start > 120_000) throw new Error("Background removal timed out");
        }
      } else {
        sourceBlob = await fetchAssetBlob(h.input_filename);
      }

      const objectUrl = URL.createObjectURL(sourceBlob);
      try {
        const outBlob = await cropToPngBlob(objectUrl, h.crop_area_pixels, h.export_size);
        const file = new File([outBlob], h.output_filename, { type: "image/png" });
        await uploadImageAs(ws, "baby", file, h.output_filename);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const runImportMissingAssetUpload = async (file: File) => {
    if (!missingAsset) return;
    if (!importWorkspaceId) return;
    setConfigImportError("");
    setConfigImportBusy(true);
    try {
      await uploadMissingAssetRemote({
        workspaceId: importWorkspaceId,
        missing: missingAsset,
        file,
        uploadImageAs,
        setStatus: setConfigImportStatus,
      });
      setMissingAsset(null);
    } catch (err) {
      setConfigImportError(describeApiError(err, "Could not upload missing file"));
      setConfigImportStatus("");
    } finally {
      setConfigImportBusy(false);
    }
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

  // Config import finalization: once required uploads are done, check for missing referenced files.
  useEffect(() => {
    if (!showConfigModal) return;
    if (configImportBusy) return;
    if (importFinalized) return;
    if (!configToImport?.session) return;
    if (!importWorkspaceId) return;
    if (!importTemplateDone) return;

    const s = configToImport.session;
    const { needsPortraits, needsBaby } = computeImportNeeds(s);

    if (needsPortraits && !importPortraitsDone) return;
    if (needsBaby && !importBabyDone) return;
    if (missingAsset) return;

    (async () => {
      try {
        setConfigImportBusy(true);
        // If the config references edited baby images, recreate them now (so missing-asset
        // checks don't force the user to hunt down intermediate edit outputs).
        if (needsBaby && importBabyDone) {
          await replayBabyEditsIfNeeded(s, importWorkspaceId);
        }

        // Defaults are available without user uploads; if the config captured a workspace-specific
        // default filename that doesn't exist in this new workspace, drop it and fall back.
        await clearMissingDefaultsForImport(s, importWorkspaceId);

        setConfigImportStatus("Checking for missing referenced files…");
        const missing = await computeMissingAssets(s, importWorkspaceId);
        if (missing) return;

        // Re-apply session last to ensure we restore the intended step/settings.
        applyImportedSession(s, importWorkspaceId);
        setImportFinalized(true);
        setConfigImportStatus("Import complete");
        setShowConfigModal(false);
      } catch (err) {
        setConfigImportError(describeApiError(err, "Import finalization failed"));
        setConfigImportStatus("");
      } finally {
        setConfigImportBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showConfigModal,
    configImportBusy,
    importFinalized,
    configToImport,
    importWorkspaceId,
    importTemplateDone,
    importPortraitsDone,
    importBabyDone,
    missingAsset,
  ]);

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
        setParseMugshotColor(saved.templateParse?.mugshotColor ?? "");
        setParseBabyColor(saved.templateParse?.babyColor ?? "");
        setParseNameColor(saved.templateParse?.nameColor ?? "");
        setParseQuoteColor(saved.templateParse?.quoteColor ?? "");
        setParseMinArea(typeof saved.templateParse?.minArea === "number" ? Math.max(400, saved.templateParse!.minArea) : 800);
        setSlots(saved.slots ?? []);
        setParsedSlots(saved.parsedSlots ?? []);
        setTemplateSize(saved.templateSize ?? null);
        setNamingPattern(saved.portraitsIngest?.namingPattern ?? defaultNamingPattern);
        setAdvancedNameMatch(Boolean(saved.portraitsIngest?.advancedNameMatch ?? true));
        setAllowInsecureUploads(Boolean(saved.portraitsIngest?.allowInsecureUploads));
        setPeople(saved.people ?? []);
        setSlotAssignments(saved.slotAssignments ?? {});
        setPlacementMode((saved.placementMode as PlacementMode) ?? "left_then_right");
        setForceAlphabetical(Boolean(saved.forceAlphabetical));
        setDefaultQuote(saved.defaultQuote ?? "404 quote not found");
        setDefaultBabyFilename(saved.defaultBabyFilename ?? null);
        setBabyIngest({
          advancedNameMatch: Boolean(saved.babyIngest?.advancedNameMatch ?? true),
          partialNameMatch: Boolean(saved.babyIngest?.partialNameMatch ?? true),
          removeBackground: Boolean(saved.babyIngest?.removeBackground ?? false),
          backgroundMode: (saved.babyIngest?.backgroundMode as BackgroundMode) ?? "simple",
          allowInsecureUploads: Boolean(saved.babyIngest?.allowInsecureUploads ?? false),
        });
        setBabyEditHistory((saved.babyEditHistory ?? []) as any);
        setBabyBackgroundColor(saved.babyBackgroundColor ?? "");
        setCenterBabyOnFace(Boolean(saved.centerBabyOnFace));
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
        if (saved.outputFormat === "png" || saved.outputFormat === "pdf" || saved.outputFormat === "tiff") {
          setOutputFormat(saved.outputFormat);
        }
        if (saved.outputSize && typeof saved.outputSize.width === "number" && typeof saved.outputSize.height === "number") {
          setOutputSize({ width: saved.outputSize.width, height: saved.outputSize.height });
        }

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
      templateParse: {
        mugshotColor: parseMugshotColor,
        babyColor: parseBabyColor,
        nameColor: parseNameColor,
        quoteColor: parseQuoteColor,
        minArea: parseMinArea,
      },
      slots,
      parsedSlots,
      templateSize,
      portraitsIngest: {
        namingPattern,
        advancedNameMatch,
        allowInsecureUploads,
      },
      people,
      slotAssignments,
      placementMode,
      forceAlphabetical,
      defaultQuote,
      defaultBabyFilename,
      babyBackgroundColor,
      centerBabyOnFace,
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
      outputFormat,
      outputSize,
    };
    trySaveSession(payload);
  }, [
    activeStep,
    workspaceId,
    templateId,
    skipQuotes,
    skipBabyPhotos,
    parseMugshotColor,
    parseBabyColor,
    parseNameColor,
    parseQuoteColor,
    parseMinArea,
    slots,
    parsedSlots,
    templateSize,
    namingPattern,
    advancedNameMatch,
    allowInsecureUploads,
    people,
    slotAssignments,
    placementMode,
    forceAlphabetical,
    defaultQuote,
    defaultBabyFilename,
    babyBackgroundColor,
    centerBabyOnFace,
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
    outputFormat,
    outputSize,
  ]);

  // Note: quotes/baby steps are not skippable. Disabling only affects rendering.

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
    if (s.startsWith("Generation failed")) return s;
    if (s.startsWith("Preview generation failed")) return s;
    if (s.startsWith("Generation polling failed")) return s;
    return null;
  }, [status]);

  // Gentle reminder to export a config after the session has been active for a while.
  useEffect(() => {
    if (!workspaceId) return;
    setShowSaveConfigReminder(false);
    const t = window.setTimeout(() => {
      setShowSaveConfigReminder(true);
    }, 10 * 60 * 1000);
    return () => window.clearTimeout(t);
  }, [workspaceId]);

  const toolMessages: ToolMessage[] = useMemo(() => {
    const out: ToolMessage[] = [];

    if (insecureHttp) {
      out.push({
        id: "insecure-http-uploads",
        kind: "warning",
        title: "Warning: Unencrypted uploads (HTTP)",
        body:
          "You are not on HTTPS. Uploads may be visible to others on the network while uploading. Use HTTPS or run on localhost if possible.",
        actions: (
          <ToggleSwitch
            checked={allowInsecureUploads}
            onChange={setAllowInsecureUploads}
            label="I understand (continue over HTTP)"
          />
        ),
      });

      if (activeStep === 6) {
        out.push({
          id: "insecure-http-results",
          kind: "warning",
          title: "Warning: Unencrypted results (HTTP)",
          body:
            "You are not on HTTPS. Results are not encrypted in transit and may be visible to others on the network. Use HTTPS or run on localhost if possible.",
          actions: (
            <ToggleSwitch
              checked={allowInsecureReviewResults}
              onChange={setAllowInsecureReviewResults}
              label="I understand (show results over HTTP)"
            />
          ),
        });
      }
    }

    if (showSaveConfigReminder) {
      out.push({
        id: "save-config-reminder",
        kind: "warning",
        title: "Reminder: save a config file",
        body: "If this session has been open for a while, save a config file periodically so you can restore your progress after a refresh or unexpected session cleanup.",
        dismissible: true,
      });
    }

    // Show critical generation errors prominently.
    if (renderFailedMessage) {
      out.push({
        id: "generation-failed",
        kind: "error",
        title: "Generation error",
        body: renderFailedMessage,
      });
    }
    return out.filter((m) => !dismissedToolMessageIds[m.id]);
  }, [activeStep, allowInsecureReviewResults, allowInsecureUploads, dismissedToolMessageIds, insecureHttp, renderFailedMessage, showSaveConfigReminder]);

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
        output_format: outputFormat,
        output_width: outputSize ? outputSize.width : undefined,
        output_height: outputSize ? outputSize.height : undefined,
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
        center_baby_on_face: skipBabyPhotos ? undefined : centerBabyOnFace,
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
          if (detail) parts.push(prefixServerMessage(detail));
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
            setStatus(`Generation failed.\nserver message:\n${statusResp.error}`);
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
          setStatus(`Generation polling failed.\n${formatServerMessage(err)}`);
          setLoading(false);
          return null;
        }
      }

      // Unreachable, but keeps TS happy about return type.
      return null;
    } catch (err) {
      console.error(err);
      const base = opts.outputFilename ? "Preview generation failed" : "Generation failed";
      setStatus(`${base}.\n${formatServerMessage(err)}`);
      setLoading(false);
      return null;
    }
  };

  const handleRenderPreview = async () => {
    if (!workspaceId || !templateId) return;
    const count = Math.min(slots.length || people.length, people.length);
    const previewPeople = getPeopleForGeneration(people).slice(0, count);

    const ext = outputFormat === "pdf" ? "pdf" : outputFormat === "tiff" ? "tiff" : "png";
    await runGeneration({
      outputFilename: `preview.${ext}`,
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
      const ext = outputFormat === "pdf" ? "pdf" : outputFormat === "tiff" ? "tiff" : "png";
      const filename = `output_${String(spreadIdx + 1).padStart(2, "0")}.${ext}`;
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

  const stepsForNav = useMemo(() => steps, []);

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
            !stepReady(idx)
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

  const configActions = (
    <div className="tool-actions tool-actions-header" aria-label="Configuration">
      <button type="button" className="tool-action-btn" onClick={handleSaveConfig} disabled={loading}>
        💾 <span>Save</span>
      </button>
      <button type="button" className="tool-action-btn" onClick={openConfigImport} disabled={loading}>
        ⤴ <span>Upload</span>
      </button>
    </div>
  );

  const saveConfigActionRef = useRef<(() => void) | null>(null);
  const uploadConfigActionRef = useRef<(() => void) | null>(null);
  saveConfigActionRef.current = () => {
    void handleSaveConfig();
  };
  uploadConfigActionRef.current = () => {
    openConfigImport();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onSave = () => {
      if (window.location.pathname !== "/tool") return;
      saveConfigActionRef.current?.();
    };

    const onUpload = () => {
      if (window.location.pathname !== "/tool") return;
      uploadConfigActionRef.current?.();
    };

    window.addEventListener("ymga:save-config", onSave);
    window.addEventListener("ymga:upload-config", onUpload);
    return () => {
      window.removeEventListener("ymga:save-config", onSave);
      window.removeEventListener("ymga:upload-config", onUpload);
    };
    // These handlers intentionally call refs to avoid re-subscribing every render.
  }, []);


  return (
    <>
      {showConfigModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Import configuration"
        >
          <div className="modal">
            <div className="modal-header">
              <div className="stack" style={{ gap: 2 }}>
                <strong>Import configuration</strong>
                <div className="muted small">Upload a config file, then provide the required source files one at a time.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConfigModal(false);
                }}
                disabled={configImportBusy}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              {configImportError && <div className="callout danger prewrap">{configImportError}</div>}
              {configImportStatus && <div className="muted small prewrap">{configImportStatus}</div>}

              {!configToImport ? (
                <label className="field">
                  <span>Configuration file (.json)</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={configImportBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      void handleConfigSelected(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : !importAnnotated ? (
                <label className="field">
                  <span>Annotated template (.png)</span>
                  <input
                    type="file"
                    accept="image/png"
                    disabled={configImportBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      setImportAnnotated(f);
                      setConfigImportStatus("Annotated template loaded. Now upload the clean template.");
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : !importClean ? (
                <label className="field">
                  <span>Clean template (.png)</span>
                  <input
                    type="file"
                    accept="image/png"
                    disabled={configImportBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      setImportClean(f);
                      void runImportTemplateIfReady(importAnnotated, f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : !importTemplateDone ? (
                <div className="stack">
                  <div className="muted">Waiting for template parse to complete.</div>
                  <button
                    type="button"
                    onClick={() => void runImportTemplateIfReady()}
                    disabled={configImportBusy}
                  >
                    Retry parse
                  </button>
                </div>
              ) : (() => {
                const s = configToImport.session;
                const { needsPortraits, needsBaby } = computeImportNeeds(s);

                if (needsPortraits && !importSpreadsheet) {
                  return (
                    <label className="field">
                      <span>Roster spreadsheet (.xlsx or .csv)</span>
                      <input
                        type="file"
                        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                        disabled={configImportBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (!f) return;
                          setImportSpreadsheet(f);
                          setConfigImportStatus("Spreadsheet loaded. Now upload the portraits ZIP.");
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  );
                }

                if (needsPortraits && !importMugshotsZip) {
                  return (
                    <label className="field">
                      <span>Portraits ZIP (.zip)</span>
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        disabled={configImportBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (!f) return;
                          setImportMugshotsZip(f);
                          void runImportPortraitsIfReady(importSpreadsheet, f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  );
                }

                if (needsPortraits && !importPortraitsDone) {
                  return (
                    <div className="stack">
                      <div className="muted">Waiting for portraits ingest to complete.</div>
                      <button type="button" onClick={() => void runImportPortraitsIfReady()} disabled={configImportBusy}>
                        Retry portraits ingest
                      </button>
                    </div>
                  );
                }

                if (needsBaby && !importBabyZip) {
                  return (
                    <label className="field">
                      <span>Baby photos ZIP (.zip)</span>
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        disabled={configImportBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (!f) return;
                          setImportBabyZip(f);
                          void runImportBabyZipIfReady(f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  );
                }

                if (needsBaby && !importBabyDone) {
                  return (
                    <div className="stack">
                      <div className="muted">Waiting for baby zip ingest to complete.</div>
                      <button type="button" onClick={() => void runImportBabyZipIfReady()} disabled={configImportBusy}>
                        Retry baby ingest
                      </button>
                    </div>
                  );
                }

                if (missingAsset) {
                  return (
                    <label className="field">
                      <span>
                        Missing file: <strong>{missingAsset.filename}</strong>
                      </span>
                      <span className="muted small">
                        Upload the {missingAsset.kind} image that matches this filename to fully restore the configuration.
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={configImportBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (!f) return;
                          void runImportMissingAssetUpload(f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  );
                }

                return <div className="muted">Finishing import…</div>;
              })()}

              <div className="actions" style={{ justifyContent: "space-between" }}>
                <button
                  type="button"
                  onClick={() => {
                    resetImportUi();
                  }}
                  disabled={configImportBusy}
                >
                  Reset import
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setShowConfigModal(false);
                    resetImportUi();
                  }}
                  disabled={configImportBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {embedded ? (
        <section className="ss-steps">
          <div className="ss-steps-inner tool-steps-header">
            {stepsNav}
          </div>
        </section>
      ) : (
        <div className="page">
          <header className="topbar">
            <div>
              <h1>Custom Yearbook Spread Automator</h1>
              <p className="muted">Developed by Sighton Innovations — local-first, ready to host later.</p>
            </div>
            <div className="topbar-right">
              {configActions}
              {stepsNav}
            </div>
          </header>
        </div>
      )}

      <div className="page">

      <ToolMessages
        messages={toolMessages}
        onDismiss={(id) => {
          setDismissedToolMessageIds((prev) => ({ ...prev, [id]: true }));
          if (id === "save-config-reminder") setShowSaveConfigReminder(false);
        }}
      />

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
                {activeStep === 6 ? (
                  <p className="muted">Preview one page, confirm people, then render all.</p>
                ) : (
                  <p className="muted">Results from the latest render.</p>
                )}
                {activeStep === 6 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {status && !renderFailedMessage && <p className="muted prewrap">{prefixServerMessage(status)}</p>}
                    {loading && progress > 0 && <ProgressBar progress={progress} />}
                  </div>
                )}
              </div>
              <div className="section-actions">
                <button disabled={loading} onClick={() => setActiveStep((s) => prevStepFrom(s))}>
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
            <TemplateParsingStep
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
              setProgress={setProgress}
              loading={loading}
              annotated={annotatedFile}
              clean={cleanFile}
              annotatedPreview={annotatedPreviewUrl}
              cleanPreview={cleanPreviewUrl}
              onAnnotatedChange={updateAnnotatedFile}
              onCleanChange={updateCleanFile}
              peoplePerSpread={peoplePerSpread}
              setPeoplePerSpread={setPeoplePerSpread}
              mugshotColor={parseMugshotColor}
              setMugshotColor={setParseMugshotColor}
              babyColor={parseBabyColor}
              setBabyColor={setParseBabyColor}
              nameColor={parseNameColor}
              setNameColor={setParseNameColor}
              quoteColor={parseQuoteColor}
              setQuoteColor={setParseQuoteColor}
              minArea={parseMinArea}
              setMinArea={setParseMinArea}
              onPreviewChange={({ annotated, clean }) => {
                setAnnotatedPreviewUrl(annotated ?? null);
                setCleanPreviewUrl(clean ?? null);
                setTemplatePreviewUrl(clean ?? annotated ?? null);
              }}
              onRawDebug={setRawDebug}
            />
          )}
          {activeStep === 5 && (
            <StylingStep
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
              <RenderPreflight
                people={people}
                peoplePerSpread={peoplePerSpread}
                templateSize={templateSize}
                outputFormat={outputFormat}
                onOutputFormat={setOutputFormat}
                outputSize={outputSize}
                onOutputSize={setOutputSize}
                placementMode={placementMode}
                onPlacementMode={setPlacementMode}
                forceAlphabetical={forceAlphabetical}
                onForceAlphabetical={setForceAlphabetical}
                loading={loading}
                canContinue={canContinue}
                handleRenderPreview={handleRenderPreview}
                workspaceId={workspaceId}
                previewPath={previewPath}
                previewNonce={previewNonce}
              />

              <ReviewStep
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
              <ResultsStep
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
                onClick={() => setActiveStep((s) => prevStepFrom(s))}
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
                  onClick={() => setActiveStep((s) => nextStepFrom(s))}
                >
                  Continue
                </button>
              ) : (
                <button className="primary" disabled={loading || !canContinue} onClick={handleRenderAll}>
                  {loading ? "Rendering..." : "Render all"}
                </button>
              )}
            </div>
          )}
          {activeStep !== 6 && activeStep !== 7 && status && !renderFailedMessage && <p className="muted prewrap">{prefixServerMessage(status)}</p>}
          {activeStep !== 6 && activeStep !== 7 && loading && progress > 0 && <ProgressBar progress={progress} />}
          </section>
        )}

        {activeStep === 2 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <MugshotMappingStep
              workspaceId={workspaceId}
              defaultMugshotFilename={defaultMugshotFilename}
              onDefaultMugshotFilename={setDefaultMugshotFilename}
              ensureDefaultMugshotEagle={ensureDefaultMugshotEagle}
              namingPattern={namingPattern}
              setNamingPattern={setNamingPattern}
              advancedNameMatch={advancedNameMatch}
              setAdvancedNameMatch={setAdvancedNameMatch}
              allowInsecureUploads={allowInsecureUploads}
              warnings={portraitWarnings}
              onWarnings={setPortraitWarnings}
              warningsOpen={portraitWarningsOpen}
              onWarningsOpen={setPortraitWarningsOpen}
              completedErrorCount={portraitCompletedErrorCount}
              onCompletedErrorCount={setPortraitCompletedErrorCount}
              onMapped={setPeople}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              loading={loading}
              people={people}
              setPeople={setPeople}
              originalPeople={originalPeople}
              setOriginalPeople={setOriginalPeople}
              status={status}
              progress={progress}
              canContinue={canContinue}
              onBack={() => setActiveStep(1)}
              onReset={requestResetAll}
              onContinue={() => setActiveStep(nextStepFrom(2))}
            />
          </section>
        )}

        {activeStep === 3 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <QuotesStepStep
              defaultQuote={defaultQuote}
              onDefaultQuote={setDefaultQuote}
              quotesWarnings={quotesWarnings}
              onQuotesWarnings={setQuotesWarnings}
              quotesWarningsOpen={quotesWarningsOpen}
              onQuotesWarningsOpen={setQuotesWarningsOpen}
              quotesCompletedErrorCount={quotesCompletedErrorCount}
              onQuotesCompletedErrorCount={setQuotesCompletedErrorCount}
              workspaceId={workspaceId}
              allowInsecureUploads={allowInsecureUploads}
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
              onContinue={() => setActiveStep(nextStepFrom(3))}
            />
          </section>
        )}

        {activeStep === 4 && (
          <section className="mapping-step">
            <h2>{steps[activeStep]}</h2>
            <BabyPhotosStepStep
              workspaceId={workspaceId}
              babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
              defaultBabyFilename={defaultBabyFilename}
              defaultQuote={defaultQuote}
              onDefaultBabyFilename={setDefaultBabyFilename}
              babyZipWarnings={babyZipWarnings}
              onBabyZipWarnings={setBabyZipWarnings}
              babyZipWarningsOpen={babyZipWarningsOpen}
              onBabyZipWarningsOpen={setBabyZipWarningsOpen}
              babyCompletedErrorCount={babyCompletedErrorCount}
              onBabyCompletedErrorCount={setBabyCompletedErrorCount}
              babyIngest={babyIngest}
              onBabyIngest={setBabyIngest}
              onBabyEditHistoryAdd={(entry) => setBabyEditHistory((prev) => [...prev, entry])}
              babyBackgroundColor={babyBackgroundColor}
              onBabyBackgroundColor={setBabyBackgroundColor}
              centerBabyOnFace={centerBabyOnFace}
              onCenterBabyOnFace={setCenterBabyOnFace}
              allowInsecureUploads={allowInsecureUploads}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              people={people}
              setPeople={setPeople}
              loading={loading}
              status={status}
              progress={progress}
              canContinue={canContinue}
              onBack={() => setActiveStep(prevStepFrom(4))}
              onReset={requestResetAll}
              onContinue={() => setActiveStep(5)}
            />
          </section>
        )}

        {activeStep === 1 && (
          <ParsingReview
            slots={slots}
            templateSize={templateSize}
            onSlots={setSlots}
            previewMode={previewMode}
            onPreviewMode={setPreviewMode}
            annotatedPreviewUrl={annotatedPreviewUrl}
            cleanPreviewUrl={cleanPreviewUrl}
            templatePreviewUrl={templatePreviewUrl}
            selectedSlot={selectedSlot}
            onSelectedSlot={setSelectedSlot}
            peoplePerSpread={peoplePerSpread}
            parsedSlots={parsedSlots}
            rawDebug={rawDebug}
            loading={loading}
            onBack={() => setActiveStep(0)}
            onReset={requestResetAll}
            onContinue={() => setActiveStep(2)}
          />
        )}
      </main>
      </div>
    </>
  );
}

