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
import { getLicenseUnlockAllStepsEnabled } from "./licensing";

import { ToggleSwitch } from "./components/ToggleSwitch";
import { UploadDropLabel } from "./components/UploadDropLabel";
import { FontPick } from "./components/FontPick";
import { ProgressBar } from "./components/ProgressBar";
import { SlotEditor } from "./components/SlotEditor";
import { TemplatePreview } from "./components/TemplatePreview";
import { InfoPopover } from "./components/InfoPopover";
import { ToolMessages, type ToolMessage } from "./components/ToolMessages";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { NoticeDialog } from "./components/NoticeDialog";
import { TipsBox } from "./components/TipsBox";
import { cropToPngBlob } from "./utils/image";
import { groupSlotsByProximity } from "./utils/slots";
import { comparePeopleByLastName, computeSlotNumberToIndex } from "./utils/placement";
import { makeRng } from "./utils/random";
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

const stepDescriptions: Partial<Record<number, string>> = {
  0: "Upload the annotated template (coloured blocks for portrait/baby/name/quote) and the clean template to be modified.",
  5: "Name and quote can be styled independently. Default size is 40pt. Font size bounds: 1–100.",
  6: "Preview one page, confirm people, then render all.",
  7: "Results from the latest render.",
};

const stepTips = [
  "Server deletes all data after 8 hours to protect privacy.",
  "If template parsing fails, try raising the color tolerance or lowering min-area in Custom options.",
  "Non-matching portrait filenames are skipped—check warnings to see which files weren't used.",
  "Missing quotes are allowed; configure a default quote as a fallback for students without entries.",
  "Save a config file occasionally so you can restore work after a refresh or long session.",
];

type AppProps = {
  embedded?: boolean;
};


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
  const [defaultQuotes, setDefaultQuotes] = useState<string[]>(["404 quote not found"]);
  const [defaultQuotesRandomize, setDefaultQuotesRandomize] = useState(false);
  const [defaultQuotesSeed, setDefaultQuotesSeed] = useState(0);
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
  const [defaultMugshotFilenames, setDefaultMugshotFilenames] = useState<string[]>([]);
  const [defaultMugshotRandomize, setDefaultMugshotRandomize] = useState(false);
  const [defaultMugshotSeed, setDefaultMugshotSeed] = useState(0);
  const [lockedPeople, setLockedPeople] = useState<Record<number, true>>({});
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
  const [reviewPanel, setReviewPanel] = useState<"preview" | "people">("preview");
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
  const [importLowResWarning, setImportLowResWarning] = useState<string | null>(null);
  const [importPortraitReviewOpen, setImportPortraitReviewOpen] = useState(false);
  const [importPortraitReviewMessage, setImportPortraitReviewMessage] = useState<string | null>(null);
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const importLowResResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);
  const importPortraitReviewResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);

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
    if (defaultMugshotFilenames.length > 0) return defaultMugshotFilenames[0] ?? null;

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
        setDefaultMugshotFilenames((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
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
    setShowResetConfirm(true);
    return false;
  };

  const requestResetAll = () => {
    if (!confirmResetAll()) return;
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

    // If this license is configured (in admin) to unlock all steps, allow access.
    if (getLicenseUnlockAllStepsEnabled()) return true;
    
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
    setDefaultQuotes(["404 quote not found"]);
    setDefaultQuotesRandomize(false);
    setDefaultQuotesSeed(0);
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
    setDefaultMugshotFilenames([]);
    setDefaultMugshotRandomize(false);
    setDefaultMugshotSeed(0);
    setLockedPeople({});
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
    setReviewPanel("preview");
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
      defaultQuote: defaultQuotes[0] ?? "404 quote not found",
      defaultQuotes,
      defaultQuotesRandomize,
      defaultQuotesSeed,
      defaultBabyFilename,
      babyIngest: { ...babyIngest, allowInsecureUploads },
      babyEditHistory,
      babyBackgroundColor,
      centerBabyOnFace,
      defaultMugshotFilename: defaultMugshotFilenames[0] ?? null,
      defaultMugshotFilenames,
      defaultMugshotRandomize,
      defaultMugshotSeed,
      lockedPeople: Object.keys(lockedPeople)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n)),
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
    const nextDefaultQuotes =
      Array.isArray(session.defaultQuotes) && session.defaultQuotes.length > 0
        ? session.defaultQuotes
        : (session.defaultQuote ? [session.defaultQuote] : ["404 quote not found"]);
    setDefaultQuotes(nextDefaultQuotes);
    setDefaultQuotesRandomize(Boolean(session.defaultQuotesRandomize));
    setDefaultQuotesSeed(typeof session.defaultQuotesSeed === "number" ? session.defaultQuotesSeed : 0);
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
    const nextDefaultMugshots =
      Array.isArray(session.defaultMugshotFilenames) && session.defaultMugshotFilenames.length > 0
        ? session.defaultMugshotFilenames
        : (session.defaultMugshotFilename ? [session.defaultMugshotFilename] : []);
    setDefaultMugshotFilenames(nextDefaultMugshots);
    setDefaultMugshotRandomize(Boolean(session.defaultMugshotRandomize));
    setDefaultMugshotSeed(typeof session.defaultMugshotSeed === "number" ? session.defaultMugshotSeed : 0);
    setLockedPeople(
      (session.lockedPeople ?? []).reduce((acc, n) => {
        if (Number.isFinite(n)) acc[Number(n)] = true;
        return acc;
      }, {} as Record<number, true>)
    );
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
    const mugshots = Array.isArray(session.defaultMugshotFilenames)
      ? session.defaultMugshotFilenames
      : (session.defaultMugshotFilename ? [String(session.defaultMugshotFilename)] : []);
    if (mugshots.length) {
      const filtered: string[] = [];
      for (const f of mugshots) {
        // eslint-disable-next-line no-await-in-loop
        if (await exists("mugshot", String(f))) filtered.push(String(f));
      }
      session.defaultMugshotFilenames = filtered;
      session.defaultMugshotFilename = filtered[0] ?? null;
    } else {
      session.defaultMugshotFilename = null;
      session.defaultMugshotFilenames = [];
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
        promptHandlers: {
          onLowResolution: (message) =>
            new Promise<"continue" | "cancel">((resolve) => {
              importLowResResolverRef.current = resolve;
              setImportLowResWarning(message);
            }),
          onPortraitNeedsReview: () =>
            new Promise<"continue" | "cancel">((resolve) => {
              importPortraitReviewResolverRef.current = resolve;
              setImportPortraitReviewMessage(
                "The uploaded image is vertical. If it is meant to be only one page, cancel and re-upload a full spread. If it is rotated wrong, rotate it after import from the template preview."
              );
              setImportPortraitReviewOpen(true);
            }),
        },
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
        // Allow deep-linking: if /app?step=N is present, prefer that over the saved step.
        const urlStep =
          typeof window !== "undefined" && window.location.pathname === "/app"
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
        const savedDefaultQuotes =
          Array.isArray(saved.defaultQuotes) && saved.defaultQuotes.length > 0
            ? saved.defaultQuotes
            : (saved.defaultQuote ? [saved.defaultQuote] : ["404 quote not found"]);
        setDefaultQuotes(savedDefaultQuotes);
        setDefaultQuotesRandomize(Boolean(saved.defaultQuotesRandomize));
        setDefaultQuotesSeed(typeof saved.defaultQuotesSeed === "number" ? saved.defaultQuotesSeed : 0);
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
        const savedDefaultMugshots =
          Array.isArray(saved.defaultMugshotFilenames) && saved.defaultMugshotFilenames.length > 0
            ? saved.defaultMugshotFilenames
            : (saved.defaultMugshotFilename ? [saved.defaultMugshotFilename] : []);
        setDefaultMugshotFilenames(savedDefaultMugshots);
        setDefaultMugshotRandomize(Boolean(saved.defaultMugshotRandomize));
        setDefaultMugshotSeed(typeof saved.defaultMugshotSeed === "number" ? saved.defaultMugshotSeed : 0);
        setLockedPeople(
          (saved.lockedPeople ?? []).reduce((acc, n) => {
            if (Number.isFinite(n)) acc[Number(n)] = true;
            return acc;
          }, {} as Record<number, true>)
        );
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

  // URL -> state: allow /app?step=N to jump to a step (and restore after navigating back).
  useEffect(() => {
    if (!didRestoreSession) return;
    if (location.pathname !== "/app") return;

    const urlStep = parseStepFromSearch(location.search);
    if (urlStep == null) return;
    if (urlStep === activeStepRef.current) return;
    goToStep(urlStep);
  }, [didRestoreSession, location.pathname, location.search]);

  // State -> URL: keep ?step= in sync (without spamming history).
  useEffect(() => {
    if (location.pathname !== "/app") return;
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
      defaultQuote: defaultQuotes[0] ?? "404 quote not found",
      defaultQuotes,
      defaultQuotesRandomize,
      defaultQuotesSeed,
      defaultBabyFilename,
      babyBackgroundColor,
      centerBabyOnFace,
      defaultMugshotFilename: defaultMugshotFilenames[0] ?? null,
      defaultMugshotFilenames,
      defaultMugshotRandomize,
      defaultMugshotSeed,
      lockedPeople: Object.keys(lockedPeople)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n)),
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
    defaultQuotes,
    defaultQuotesRandomize,
    defaultQuotesSeed,
    defaultBabyFilename,
    babyBackgroundColor,
    centerBabyOnFace,
    defaultMugshotFilenames,
    defaultMugshotRandomize,
    defaultMugshotSeed,
    lockedPeople,
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

  const defaultQuoteFallback = defaultQuotes[0] ?? "404 quote not found";

  const defaultMugshotAssignments = useMemo(() => {
    if (!defaultMugshotFilenames.length) return {} as Record<number, string>;
    const missing = people.filter((p) => !p.mugshot_filename);
    const out: Record<number, string> = {};
    let patternIdx = 0;
    const rng = makeRng(defaultMugshotSeed || 1);
    for (const p of missing) {
      const choice = defaultMugshotRandomize
        ? defaultMugshotFilenames[Math.floor(rng() * defaultMugshotFilenames.length)]
        : defaultMugshotFilenames[patternIdx++ % defaultMugshotFilenames.length];
      if (choice) out[p.index] = choice;
    }
    return out;
  }, [people, defaultMugshotFilenames, defaultMugshotRandomize, defaultMugshotSeed]);

  const defaultQuoteAssignments = useMemo(() => {
    if (!defaultQuotes.length) return {} as Record<number, string>;
    const out: Record<number, string> = {};
    let patternIdx = 0;
    const rng = makeRng(defaultQuotesSeed || 1);
    for (const p of people) {
      const hasQuote = Boolean((p.quote ?? "").trim());
      if (hasQuote) continue;
      const choice = defaultQuotesRandomize
        ? defaultQuotes[Math.floor(rng() * defaultQuotes.length)]
        : defaultQuotes[patternIdx++ % defaultQuotes.length];
      if (choice) out[p.index] = choice;
    }
    return out;
  }, [people, defaultQuotes, defaultQuotesRandomize, defaultQuotesSeed]);

  useEffect(() => {
    if (!defaultMugshotRandomize) return;
    setDefaultMugshotSeed(Date.now());
  }, [defaultMugshotRandomize, defaultMugshotFilenames.length]);

  useEffect(() => {
    if (!defaultQuotesRandomize) return;
    setDefaultQuotesSeed(Date.now());
  }, [defaultQuotesRandomize, defaultQuotes.length]);

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
    suppressStatus?: boolean;
    manageLoading?: boolean;
  }): Promise<string | null> => {
    if (!workspaceId || !templateId) return null;
    const manageLoading = opts.manageLoading ?? true;
    const suppressStatus = Boolean(opts.suppressStatus);
    if (!suppressStatus) {
      setProgress(0);
    }
    if (manageLoading) {
      setLoading(true);
    }
    const baseLabel = opts.spreadIndex && opts.totalSpreads
      ? `Rendering spread ${opts.spreadIndex}/${opts.totalSpreads}...`
      : (opts.statusLabel || (opts.outputFilename ? "Generating preview..." : "Generating spread..."));
    if (!suppressStatus) {
      setStatus(baseLabel);
    }
    try {
      const ensuredDefaultMugshot = await ensureDefaultMugshotEagle();
      const ensuredDefaultBaby = skipBabyPhotos ? undefined : ((await ensureDefaultBabyAbcBlocks()) ?? undefined);
      const peopleInput = opts.peopleOverride ?? people;
      const fallbackDefaults = defaultMugshotFilenames.length
        ? defaultMugshotFilenames
        : (ensuredDefaultMugshot ? [ensuredDefaultMugshot] : []);
      let fallbackIdx = 0;
      const peopleToSend = peopleInput.map((p) => {
        const hasQuote = Boolean((p.quote ?? "").trim());
        const quoteValue = skipQuotes
          ? null
          : (hasQuote ? p.quote : (defaultQuoteAssignments[p.index] ?? defaultQuoteFallback));
        let mugshotValue = p.mugshot_filename ?? null;
        if (!mugshotValue) {
          mugshotValue = defaultMugshotAssignments[p.index] ?? fallbackDefaults[fallbackIdx % Math.max(1, fallbackDefaults.length)] ?? null;
          fallbackIdx += 1;
        }
        return {
          ...p,
          mugshot_filename: mugshotValue,
          quote: quoteValue,
          baby_photo_filename: skipBabyPhotos ? null : p.baby_photo_filename,
        };
      });
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
        default_quote: skipQuotes ? undefined : defaultQuoteFallback,
        default_mugshot_filename: fallbackDefaults[0] ?? ensuredDefaultMugshot,
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
          if (!suppressStatus && hasMulti) {
            const doneSpreads = Math.max(0, (opts.spreadIndex ?? 1) - 1);
            const totalSpreads = Math.max(1, opts.totalSpreads ?? 1);
            const overallFrac = Math.max(0, Math.min(1, (doneSpreads + spreadPct / 100) / totalSpreads));
            setProgress(Math.round(overallFrac * 100));
          } else if (!suppressStatus) {
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
          if (!suppressStatus) {
            setStatus(parts.join(" — "));
          }

          if (statusResp.error) {
            if (!suppressStatus) {
              setStatus(`Generation failed.\nserver message:\n${statusResp.error}`);
            }
            if (manageLoading) {
              setLoading(false);
            }
            return null;
          }
          if (statusResp.output) {
            opts.onDone?.(statusResp.output);
            if (!suppressStatus) {
              setStatus(opts.outputFilename ? "Preview ready" : "Generation complete");
              setProgress(100);
            }
            if (manageLoading) {
              setLoading(false);
            }
            return statusResp.output;
          }
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          console.error(err);
          if (!suppressStatus) {
            setStatus(`Generation polling failed.\n${formatServerMessage(err)}`);
          }
          if (manageLoading) {
            setLoading(false);
          }
          return null;
        }
      }

      // Unreachable, but keeps TS happy about return type.
      return null;
    } catch (err) {
      console.error(err);
      const base = opts.outputFilename ? "Preview generation failed" : "Generation failed";
      if (!suppressStatus) {
        setStatus(`${base}.\n${formatServerMessage(err)}`);
      }
      if (manageLoading) {
        setLoading(false);
      }
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
    const maxParallel = 3;
    const ext = outputFormat === "pdf" ? "pdf" : outputFormat === "tiff" ? "tiff" : "png";
    const results: (string | null)[] = Array.from({ length: totalSpreads }, () => null);
    let completed = 0;
    let nextIndex = 0;
    let failed = false;

    setLoading(true);
    setProgress(0);
    setStatus(`Rendering ${totalSpreads} spreads (max ${maxParallel} at a time)...`);

    const worker = async () => {
      while (true) {
        if (failed) return;
        const spreadIdx = nextIndex;
        if (spreadIdx >= totalSpreads) return;
        nextIndex += 1;

        const start = spreadIdx * perSpread;
        const end = Math.min(peopleForAll.length, start + perSpread);
        const spreadPeople = peopleForAll.slice(start, end);
        const filename = `output_${String(spreadIdx + 1).padStart(2, "0")}.${ext}`;
        const out = await runGeneration({
          outputFilename: filename,
          peopleOverride: spreadPeople,
          spreadIndex: spreadIdx + 1,
          totalSpreads,
          overallStartMs,
          countUsage: spreadIdx === 0,
          suppressStatus: true,
          manageLoading: false,
        });

        if (!out) {
          failed = true;
          return;
        }

        results[spreadIdx] = out;
        completed += 1;
        const pct = Math.round((completed / Math.max(1, totalSpreads)) * 100);
        setProgress(pct);
        setStatus(`Rendered ${completed}/${totalSpreads} spreads...`);
        setOutputPaths(results.filter((r): r is string => Boolean(r)));
      }
    };

    const workers = Array.from({ length: Math.min(maxParallel, totalSpreads) }, () => worker());
    await Promise.all(workers);

    if (failed) {
      setStatus("Generation failed.\nOne or more spreads did not render successfully.");
      setLoading(false);
      return;
    }

    for (const out of results) {
      if (out) outputs.push(out);
    }

    setOutputPath(outputs[0] || null);
    setOutputNonce((n) => n + 1);
    setLoading(false);
    setProgress(100);
    setStatus("Generation complete");
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
    <div className="tool-actions topbar-actions" aria-label="Configuration">
      <button type="button" className="tool-action-btn" onClick={handleSaveConfig} disabled={loading}>
        <span>Export</span>
      </button>
      <button type="button" className="tool-action-btn" onClick={openConfigImport} disabled={loading}>
        <span>Import</span>
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
      if (window.location.pathname !== "/app") return;
      saveConfigActionRef.current?.();
    };

    const onUpload = () => {
      if (window.location.pathname !== "/app") return;
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
      <ConfirmDialog
        open={showResetConfirm}
        title="Reset everything?"
        message="This will clear parsed template, people, and settings for this workspace."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setShowResetConfirm(false);
          handleReset();
        }}
      />
      <ConfirmDialog
        open={Boolean(importLowResWarning)}
        title="Low resolution spread"
        message={importLowResWarning ?? undefined}
        confirmLabel="Continue"
        cancelLabel="Cancel upload"
        onCancel={() => {
          importLowResResolverRef.current?.("cancel");
          importLowResResolverRef.current = null;
          setImportLowResWarning(null);
        }}
        onConfirm={() => {
          importLowResResolverRef.current?.("continue");
          importLowResResolverRef.current = null;
          setImportLowResWarning(null);
        }}
      />
      <NoticeDialog
        open={importPortraitReviewOpen}
        title="Portrait spread check"
        message={importPortraitReviewMessage ?? undefined}
        actionLabel="Cancel"
        secondaryLabel="Continue"
        emphasizeAction
        onAction={() => {
          importPortraitReviewResolverRef.current?.("cancel");
          importPortraitReviewResolverRef.current = null;
          setImportPortraitReviewOpen(false);
          setImportPortraitReviewMessage(null);
        }}
        onSecondary={() => {
          importPortraitReviewResolverRef.current?.("continue");
          importPortraitReviewResolverRef.current = null;
          setImportPortraitReviewOpen(false);
          setImportPortraitReviewMessage(null);
        }}
      />
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
        <>
          <div className="page tool-messages-row">
            <ToolMessages
              messages={toolMessages}
              onDismiss={(id) => {
                setDismissedToolMessageIds((prev) => ({ ...prev, [id]: true }));
                if (id === "save-config-reminder") setShowSaveConfigReminder(false);
              }}
            />
          </div>
          <section className="ss-steps">
            <div className="ss-steps-inner tool-steps-header">
              {stepsNav}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="page">
            <header className="topbar tool-topbar">
              <div>
                <div className="topbar-title-row">
                  <h1>Custom Yearbook Spread Automator</h1>
                  {configActions}
                </div>
                <p className="muted">Developed by Sighton Innovations — local-first, ready to host later.</p>
              </div>
            </header>
          </div>
          <div className="page tool-messages-row">
            <ToolMessages
              messages={toolMessages}
              onDismiss={(id) => {
                setDismissedToolMessageIds((prev) => ({ ...prev, [id]: true }));
                if (id === "save-config-reminder") setShowSaveConfigReminder(false);
              }}
            />
          </div>
          <section className="tool-steps-bar" aria-label="Tool steps">
            <div className="tool-steps-bar-inner">
              {stepsNav}
            </div>
          </section>
        </>
      )}

      <div
        className={clsx("page", {
          "page-wide": activeStep === 2 || activeStep === 3 || activeStep === 4 || activeStep === 6,
        })}
      >

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
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <h2>{steps[activeStep]}</h2>
                  {stepDescriptions[activeStep] ? (
                    <InfoPopover
                      content={stepDescriptions[activeStep]}
                      ariaLabel={`${steps[activeStep]} description`}
                      position="below"
                    />
                  ) : null}
                </div>
                {activeStep === 6 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {status && !renderFailedMessage && <p className="muted prewrap">{prefixServerMessage(status)}</p>}
                    {loading && progress > 0 && <ProgressBar progress={progress} />}
                    <div className="review-tabs" role="tablist" aria-label="Review panels">
                      <button
                        type="button"
                        className={clsx("review-tab", { active: reviewPanel === "preview" })}
                        onClick={() => setReviewPanel("preview")}
                        aria-pressed={reviewPanel === "preview"}
                      >
                        Preview & settings
                      </button>
                      <button
                        type="button"
                        className={clsx("review-tab", { active: reviewPanel === "people" })}
                        onClick={() => setReviewPanel("people")}
                        aria-pressed={reviewPanel === "people"}
                      >
                        People cards
                      </button>
                    </div>
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
            <div className="inline" style={{ alignItems: "center", gap: 6 }}>
              <h2>{steps[activeStep]}</h2>
              {stepDescriptions[activeStep] ? (
                <InfoPopover content={stepDescriptions[activeStep]} ariaLabel={`${steps[activeStep]} description`} />
              ) : null}
            </div>
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
            {reviewPanel === "preview" && insecureHttp && !allowInsecureReviewResults ? (
              <p className="muted">Enable the toggle above to view results over HTTP.</p>
            ) : reviewPanel === "preview" ? (
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
                layout="split"
              />
            ) : (
              <ReviewStep
                people={people}
                workspaceId={workspaceId}
                babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
                defaultBabyFilename={defaultBabyFilename}
                defaultQuoteFallback={defaultQuoteFallback}
                defaultQuoteAssignments={defaultQuoteAssignments}
                defaultMugshotAssignments={defaultMugshotAssignments}
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
          {activeStep <= 4 && (
            <div className="tool-tips-center">
              <TipsBox tips={stepTips} />
            </div>
          )}
          {activeStep !== 6 && activeStep !== 7 && loading && progress > 0 && <ProgressBar progress={progress} />}
          </section>
        )}

        {activeStep === 2 && (
          <section className="mapping-step">
            <MugshotMappingStep
              workspaceId={workspaceId}
                babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
              defaultMugshotFilenames={defaultMugshotFilenames}
              onDefaultMugshotFilenames={setDefaultMugshotFilenames}
              defaultMugshotRandomize={defaultMugshotRandomize}
              onDefaultMugshotRandomize={setDefaultMugshotRandomize}
              defaultMugshotAssignments={defaultMugshotAssignments}
              defaultBabyFilename={defaultBabyFilename}
              babyBackgroundColor={babyBackgroundColor}
              babyBackgroundMode={babyIngest.backgroundMode as BackgroundMode}
              onBabyEditHistoryAdd={(entry) => setBabyEditHistory((prev) => [...prev, entry])}
              defaultQuoteAssignments={defaultQuoteAssignments}
              defaultQuoteFallback={defaultQuoteFallback}
              lockedPeople={lockedPeople}
              onLockedPeople={setLockedPeople}
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
            <QuotesStepStep
              defaultQuotes={defaultQuotes}
              onDefaultQuotes={setDefaultQuotes}
              defaultQuotesRandomize={defaultQuotesRandomize}
              onDefaultQuotesRandomize={setDefaultQuotesRandomize}
              defaultQuoteAssignments={defaultQuoteAssignments}
              defaultMugshotAssignments={defaultMugshotAssignments}
              defaultBabyFilename={defaultBabyFilename}
              babyBackgroundColor={babyBackgroundColor}
              babyBackgroundMode={babyIngest.backgroundMode as BackgroundMode}
              onBabyEditHistoryAdd={(entry) => setBabyEditHistory((prev) => [...prev, entry])}
              babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
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
            <BabyPhotosStepStep
              workspaceId={workspaceId}
              babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
              defaultBabyFilename={defaultBabyFilename}
              defaultQuoteFallback={defaultQuoteFallback}
              defaultQuoteAssignments={defaultQuoteAssignments}
              defaultMugshotAssignments={defaultMugshotAssignments}
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

