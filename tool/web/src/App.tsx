import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./utils/dialogFocus";
import { clsx } from "clsx";
import type { Area } from "react-easy-crop";
import { useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, LayoutTemplate, Sparkles, Type, Upload, Users } from "lucide-react";
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
  generationListOutputs,
  cancelGeneration,
  touchWorkspace,
  deleteWorkspace,
  getWorkspaceState,
  setWorkspaceState,
  startRemoveBackgroundPreviewJob,
  removeBackgroundPreviewStatus,
  fetchRemoveBackgroundPreviewResult,
  detectFaceCenter,
  getAdminFeatureFlags,
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
import { ProgressBar } from "./components/ProgressBar";
import { InfoPopover } from "./components/InfoPopover";
import { ToolMessages, type ToolMessage } from "./components/ToolMessages";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { NoticeDialog } from "./components/NoticeDialog";
import { TipsBox } from "./components/TipsBox";
import { RoadmapRail, type RoadmapItem, type RoadmapStatus } from "./components/RoadmapRail";
import { TabBar, type TabBarItem } from "./components/TabBar";
import { cropToPngBlob } from "./utils/image";
import { groupSlotsByProximity } from "./utils/slots";
import { comparePeopleByLastName, computeSlotNumberToIndex } from "./utils/placement";
import { makeRng } from "./utils/random";
import { formatEtaSeconds, prefixServerMessage, scrollPastTopBar } from "./utils/ui";

import {
  clearSession,
  createSessionIdentity,
  ensureSessionTiming,
  getRemainingSessionMs,
  isSessionExpired,
  isPersistedSessionV1,
  migrateActiveStep,
  parseStepFromSearch,
  SESSION_TTL_MS,
  tryLoadSession,
  trySaveSession,
  type EditTab,
  type PersistedSessionV1,
  type TopStep,
} from "./session";

import type { Align, FontWeight, PlacementMode } from "./types";

import { ImportStep } from "./steps/ImportStep";
import { EditStep } from "./steps/edit/EditStep";
import { FinalizeStep } from "./steps/FinalizeStep";

const TOP_STEPS: { id: TopStep; label: string; description: string; optional?: boolean; icon: React.ReactNode }[] = [
  { id: "template", label: "Template", description: "Upload your layout & confirm the detected slots", icon: <LayoutTemplate size={15} /> },
  { id: "roster", label: "Uploads", description: "Upload your roster, portraits, quotes & baby photos", icon: <Upload size={15} /> },
  { id: "people", label: "People", description: "Review every student's portrait, quote & baby photo", icon: <Users size={15} /> },
  { id: "style", label: "Style", description: "Fonts & text styling for names and quotes", icon: <Type size={15} /> },
  { id: "generate", label: "Generate", description: "Render and download your finished pages", icon: <Sparkles size={15} /> },
];

const stepTips = [
  "Server deletes all data when your session timeout expires to protect privacy.",
  "If template parsing fails, try raising the color tolerance or lowering min-area in Custom options.",
  "Non-matching portrait filenames are skipped—check warnings to see which files weren't used.",
  "Missing quotes are allowed; configure a default quote as a fallback for students without entries.",
  "Save a config file occasionally so you can restore work after a refresh or long session.",
];

const formatSessionDurationLabel = (ttlMs: number): string => {
  const totalSeconds = Math.max(60, Math.floor(ttlMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes <= 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
};

type AppProps = {
  embedded?: boolean;
  initialWorkspaceId?: string | null;
  initialLicenseType?: "personal" | "commercial" | null;
  clientSessionId?: string | null;
  initialSessionExpiresAtMs?: number | null;
  initialSessionExpiryDisabled?: boolean;
};


export default function App({
  embedded = false,
  initialWorkspaceId = null,
  clientSessionId = null,
  initialSessionExpiresAtMs = null,
  initialSessionExpiryDisabled = false,
}: AppProps) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeStep, setActiveStep] = useState<TopStep>("template");
  const [editTab, setEditTab] = useState<EditTab>("layout");
  // Template step has two sub-views the user toggles between: upload the template, or review the parse.
  const [templateView, setTemplateView] = useState<"upload" | "review">("upload");
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const activeStepRef = useRef<TopStep>("template");
  activeStepRef.current = activeStep;

  // Jump back to the top of the page whenever the user changes steps so each step
  // (especially the long People grid) starts from the top instead of mid-scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeStep]);
  const [sessionIdentity, setSessionIdentity] = useState(() => {
    const base = createSessionIdentity();
    if (clientSessionId && clientSessionId.trim()) return { ...base, sessionId: clientSessionId.trim() };
    return base;
  });
  const [sessionTtlMs, setSessionTtlMs] = useState<number>(SESSION_TTL_MS);
  const [sessionRemainingMs, setSessionRemainingMs] = useState<number>(SESSION_TTL_MS);
  const [workspaceHeartbeatSeconds, setWorkspaceHeartbeatSeconds] = useState<number>(20);
  // Server-authoritative workspace-session expiry (from /api/workspaces/resolve),
  // used for the topbar countdown instead of the client-guessed sessionTtlMs above —
  // this is the value that actually governs when the backend janitor deletes the
  // workspace, and correctly reflects per-license (personal vs. commercial custom/
  // disabled) policy that a single client-side constant can't represent.
  const [serverSessionExpiresAtMs, setServerSessionExpiresAtMs] = useState<number | null>(initialSessionExpiresAtMs);
  const [serverSessionExpiryDisabled, setServerSessionExpiryDisabled] = useState<boolean>(initialSessionExpiryDisabled);
  const [serverSessionRemainingMs, setServerSessionRemainingMs] = useState<number>(
    initialSessionExpiresAtMs ? Math.max(0, initialSessionExpiresAtMs - Date.now()) : 0
  );
  const sessionExpiryHandledRef = useRef(false);
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
  const [originalBabyPeople, setOriginalBabyPeople] = useState<PersonRecord[] | null>(null);

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
    convertPdfs: true,
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
  const [progress, setProgress] = useState(0);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState<string | null>(null);
  const [cleanPreviewUrl, setCleanPreviewUrl] = useState<string | null>(null);
  const [annotatedFile, setAnnotatedFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState<"clean" | "annotated">("clean");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [allowInsecureReviewResults, setAllowInsecureReviewResults] = useState(false);
  const [peoplePerSpread, setPeoplePerSpread] = useState<number>(16);
  const [outputFormat, setOutputFormat] = useState<"png" | "pdf" | "tiff">("png");
  const [outputSize, setOutputSize] = useState<{ width: number; height: number } | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("left_then_right");
  const [forceAlphabetical, setForceAlphabetical] = useState(false);
  const [rawDebug, setRawDebug] = useState<RawParseDebug | null>(null);
  const [parsedSlots, setParsedSlots] = useState<TemplateSlots[]>([]);
  const [backgroundRemovalOpsEnabled, setBackgroundRemovalOpsEnabled] = useState(false);
  const [centerOnFaceOpsEnabled, setCenterOnFaceOpsEnabled] = useState(false);
  const [quotesFeatureEnabled, setQuotesFeatureEnabled] = useState(true);
  const [babyPhotosFeatureEnabled, setBabyPhotosFeatureEnabled] = useState(true);
  const [pdfOutputEnabled, setPdfOutputEnabled] = useState(true);
  const [tiffOutputEnabled, setTiffOutputEnabled] = useState(true);
  const [alphabeticalSortOptionEnabled, setAlphabeticalSortOptionEnabled] = useState(true);
  const [advancedNameMatchingEnabled, setAdvancedNameMatchingEnabled] = useState(true);
  const [customFontUploadEnabled, setCustomFontUploadEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await getAdminFeatureFlags();
        if (!cancelled) {
          const legacy = Boolean(flags.enable_heavy_generation_ops);
          setBackgroundRemovalOpsEnabled(Boolean(flags.enable_background_removal_ops ?? legacy));
          setCenterOnFaceOpsEnabled(Boolean(flags.enable_center_on_face_ops ?? legacy));
          setQuotesFeatureEnabled(flags.enable_quotes_feature ?? true);
          setBabyPhotosFeatureEnabled(flags.enable_baby_photos_feature ?? true);
          setPdfOutputEnabled(flags.enable_pdf_output ?? true);
          setTiffOutputEnabled(flags.enable_tiff_output ?? true);
          setAlphabeticalSortOptionEnabled(flags.enable_alphabetical_sort_option ?? true);
          setAdvancedNameMatchingEnabled(flags.enable_advanced_name_matching ?? true);
          setCustomFontUploadEnabled(flags.enable_custom_font_upload ?? true);
          const configuredTimeoutSeconds = Number(flags.personal_workspace_timeout_seconds ?? 0);
          if (Number.isFinite(configuredTimeoutSeconds) && configuredTimeoutSeconds >= 60) {
            setSessionTtlMs(Math.floor(configuredTimeoutSeconds * 1000));
          }
          const configuredHeartbeatSeconds = Number(flags.workspace_heartbeat_interval_seconds ?? 0);
          if (Number.isFinite(configuredHeartbeatSeconds) && configuredHeartbeatSeconds >= 5) {
            setWorkspaceHeartbeatSeconds(Math.floor(configuredHeartbeatSeconds));
          }
        }
      } catch {
        if (!cancelled) {
          setBackgroundRemovalOpsEnabled(false);
          setCenterOnFaceOpsEnabled(false);
          // Tool-feature toggles fail open (default on) so a transient admin API
          // error never silently hides features that are actually enabled.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    setSessionIdentity((prev) => {
      const startedAtMs = Number.isFinite(prev.startedAtMs) ? prev.startedAtMs : now;
      const nextExpiresAtMs = startedAtMs + sessionTtlMs;
      if (prev.expiresAtMs === nextExpiresAtMs && prev.startedAtMs === startedAtMs) return prev;
      return {
        ...prev,
        startedAtMs,
        expiresAtMs: nextExpiresAtMs,
      };
    });
  }, [sessionTtlMs]);

  useEffect(() => {
    if (centerOnFaceOpsEnabled) return;
    if (centerBabyOnFace) setCenterBabyOnFace(false);
  }, [centerOnFaceOpsEnabled, centerBabyOnFace]);

  // Admin-disabled tool features force their corresponding session choice off/
  // back to a safe default, rather than just hiding the toggle (so a session
  // that was mid-flight when an admin disables something doesn't keep using it).
  useEffect(() => {
    if (quotesFeatureEnabled) return;
    if (!skipQuotes) setSkipQuotes(true);
  }, [quotesFeatureEnabled, skipQuotes]);

  useEffect(() => {
    if (babyPhotosFeatureEnabled) return;
    if (!skipBabyPhotos) setSkipBabyPhotos(true);
  }, [babyPhotosFeatureEnabled, skipBabyPhotos]);

  useEffect(() => {
    if (alphabeticalSortOptionEnabled) return;
    if (forceAlphabetical) setForceAlphabetical(false);
  }, [alphabeticalSortOptionEnabled, forceAlphabetical]);

  useEffect(() => {
    if (outputFormat === "pdf" && !pdfOutputEnabled) setOutputFormat("png");
    if (outputFormat === "tiff" && !tiffOutputEnabled) setOutputFormat("png");
  }, [outputFormat, pdfOutputEnabled, tiffOutputEnabled]);

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
  const defaultNamingPattern = "\\d{1,4}";
  const [namingPattern, setNamingPattern] = useState<string>(defaultNamingPattern);
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [allowInsecureUploads, setAllowInsecureUploads] = useState(false);

  useEffect(() => {
    if (advancedNameMatchingEnabled) return;
    if (advancedNameMatch) setAdvancedNameMatch(false);
  }, [advancedNameMatchingEnabled, advancedNameMatch]);

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
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);
  const [workspaceDefaultsHydrated, setWorkspaceDefaultsHydrated] = useState(false);
  const lastServerSyncedSnapshotRef = useRef<string>("");

  const importLowResResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);
  const importPortraitReviewResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);

  const defaultBabyUploadInFlight = useRef<Promise<string> | null>(null);
  const defaultMugshotUploadInFlight = useRef<Promise<string> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const isServerProvidedDefaultBaby = (filename: string | null | undefined): boolean => {
    const name = String(filename || "").toLowerCase();
    return name.startsWith("default_baby_abc_blocks");
  };

  const isServerProvidedDefaultMugshot = (filename: string | null | undefined): boolean => {
    const name = String(filename || "").toLowerCase();
    return name.startsWith("default_eagle");
  };

  const workspaceAssetExists = async (
    kind: "baby" | "mugshot",
    filename: string | null | undefined,
  ): Promise<boolean> => {
    if (!workspaceId) return false;
    const safeName = String(filename || "").trim();
    if (!safeName) return false;
    const url = `${assetUrl(workspaceId, kind, safeName)}&cache_bust=${Date.now()}`;
    try {
      let resp = await fetch(url, { method: "HEAD" });
      if (resp.status === 405) {
        resp = await fetch(url, { method: "GET", cache: "no-store" });
      }
      return resp.ok;
    } catch {
      return false;
    }
  };

  const ensureDefaultBabyAbcBlocks = async (): Promise<string | null> => {
    if (!workspaceId) return null;

    if (defaultBabyFilename) {
      const exists = await workspaceAssetExists("baby", defaultBabyFilename);
      if (exists) return defaultBabyFilename;
      if (!isServerProvidedDefaultBaby(defaultBabyFilename)) {
        return defaultBabyFilename;
      }
      setDefaultBabyFilename(null);
    }

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

    if (defaultMugshotFilenames.length > 0) {
      const next: string[] = [];
      for (const filename of defaultMugshotFilenames) {
        if (!isServerProvidedDefaultMugshot(filename)) {
          next.push(filename);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const exists = await workspaceAssetExists("mugshot", filename);
        if (exists) next.push(filename);
      }
      if (next.length !== defaultMugshotFilenames.length) {
        setDefaultMugshotFilenames(next);
      }
      if (next.length > 0) return next[0] ?? null;
    }

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

  useEffect(() => {
    if (!workspaceId || !workspaceDefaultsHydrated) return;

    let canceled = false;
    (async () => {
      try {
        if (defaultBabyFilename && isServerProvidedDefaultBaby(defaultBabyFilename)) {
          const ok = await workspaceAssetExists("baby", defaultBabyFilename);
          if (!ok && !canceled) {
            await ensureDefaultBabyAbcBlocks();
          }
        }

        if (defaultMugshotFilenames.some((f) => isServerProvidedDefaultMugshot(f))) {
          await ensureDefaultMugshotEagle();
        }
      } catch {
        // Non-blocking self-heal path.
      }
    })();

    return () => {
      canceled = true;
    };
  }, [workspaceId, workspaceDefaultsHydrated, defaultBabyFilename, defaultMugshotFilenames]);

  const confirmResetAll = () => {
    setShowResetConfirm(true);
    return false;
  };

  const requestResetAll = () => {
    if (!confirmResetAll()) return;
  };

  const editTabReady = (tab: EditTab): boolean => {
    if (getLicenseUnlockAllStepsEnabled()) return true;
    if (tab === "layout") return Boolean(workspaceId && slots.length);
    if (tab === "people") return Boolean(workspaceId && slots.length);
    return people.length > 0; // "style"
  };

  const templateReady = Boolean(workspaceId && slots.length);
  const rosterReady = Boolean(workspaceId && slots.length && people.length);

  const topStepReady = (step: TopStep): boolean => {
    if (getLicenseUnlockAllStepsEnabled()) return true;
    switch (step) {
      case "template":
        return true;
      case "roster":
        return templateReady;
      case "people":
        return rosterReady;
      case "style":
      case "generate":
        return rosterReady;
    }
  };

  // Per-step completion (for the roadmap rail's done/current markers), independent of gating.
  const topStepComplete = (step: TopStep): boolean => {
    switch (step) {
      case "template":
        return templateReady;
      case "roster":
        return rosterReady;
      case "people":
        return rosterReady;
      case "style":
        return rosterReady;
      case "generate":
        return Boolean(outputPaths.length || outputPath);
    }
  };

  const goToStep = (target: TopStep) => {
    if (loading) {
      setStatus("Please wait for the current operation to finish");
      return;
    }
    if (!topStepReady(target)) {
      setStatus("Complete the previous steps before jumping ahead");
      return;
    }
    setActiveStep(target);
  };

  const stepIndex = (s: TopStep): number => TOP_STEPS.findIndex((t) => t.id === s);
  const goToAdjacentStep = (dir: -1 | 1) => {
    const next = TOP_STEPS[stepIndex(activeStep) + dir];
    if (next) goToStep(next.id);
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
      convertPdfs: true,
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
    setOutputFormat("png");
    setOutputSize(null);
    setUsageInfo(null);
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
    setPeoplePerSpread(16);
    setPlacementMode("left_then_right");
    setForceAlphabetical(false);
    setOriginalPeople(null);
    setOriginalBabyPeople(null);
    setRawDebug(null);
    setAllowInsecureReviewResults(false);
    setShowSaveConfigReminder(false);
    setDismissedToolMessageIds({});
    setPortraitWarnings([]);
    setPortraitWarningsOpen(false);
    setPortraitCompletedErrorCount(null);
    setQuotesWarnings([]);
    setQuotesWarningsOpen(false);
    setQuotesCompletedErrorCount(null);
    setBabyZipWarnings([]);
    setBabyZipWarningsOpen(false);
    setBabyCompletedErrorCount(null);
    setActiveStep("template");
    setEditTab("layout");
    setTemplateView("upload");
    resetImportUi();
    clearSession();
    lastServerSyncedSnapshotRef.current = "";
    const nextIdentity = createSessionIdentity(Date.now(), sessionTtlMs);
    setSessionIdentity(nextIdentity);
    setSessionRemainingMs(sessionTtlMs);
    // The workspace this pointed to was just deleted; the topbar will get an
    // accurate value again once a new workspace is resolved (next page load).
    setServerSessionExpiresAtMs(null);
    setServerSessionExpiryDisabled(false);
    sessionExpiryHandledRef.current = false;
  };

  // User-initiated "Reset all": wipe in-memory state, delete the server workspace,
  // and then hard-reload from a clean URL. The reload guarantees a true clean slate
  // — it drops any stale session snapshot (local or server) that could otherwise be
  // rehydrated and make the tool think the template was already parsed.
  const performFullReset = () => {
    const toDelete = workspaceId;
    handleReset();
    void (async () => {
      try {
        if (toDelete) await deleteWorkspace(toDelete);
      } catch {
        // best-effort; janitor/TTL still cleans up server-side
      } finally {
        if (typeof window !== "undefined") {
          window.location.replace(window.location.pathname);
        }
      }
    })();
  };

  const buildSessionPayload = (): PersistedSessionV1 => {
    return {
      v: 1,
      sessionId: sessionIdentity.sessionId,
      startedAtMs: sessionIdentity.startedAtMs,
      expiresAtMs: sessionIdentity.expiresAtMs,
      activeStep,
      editTab,
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
      outputFormat,
      outputSize,
      generationOutputs: {
        previewPath,
        outputPath,
        outputPaths,
      },
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

  const configModalRef = useRef<HTMLDivElement | null>(null);
  const closeConfigModalOnEscape = useCallback(() => {
    if (!configImportBusy) setShowConfigModal(false);
  }, [configImportBusy]);
  useDialogFocus(showConfigModal, configModalRef, closeConfigModalOnEscape);

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
      convertPdfs: Boolean(session.babyIngest?.convertPdfs ?? true),
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
    if (session.outputFormat === "png" || session.outputFormat === "pdf" || session.outputFormat === "tiff") {
      setOutputFormat(session.outputFormat);
    }
    if (
      session.outputSize &&
      typeof session.outputSize.width === "number" &&
      typeof session.outputSize.height === "number" &&
      session.outputSize.width > 0 &&
      session.outputSize.height > 0
    ) {
      setOutputSize({ width: session.outputSize.width, height: session.outputSize.height });
    }

    setTemplatePreviewUrl(`${templateCleanUrl(newWorkspaceId)}&t=${Date.now()}`);
    setAnnotatedPreviewUrl(`${templateAnnotatedUrl(newWorkspaceId)}&t=${Date.now()}`);
    setCleanPreviewUrl(`${templateCleanUrl(newWorkspaceId)}&t=${Date.now()}`);

    setActiveStep(migrateActiveStep(session.activeStep));
    setEditTab(session.editTab ?? "layout");
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
    if (!workspaceId) {
      setConfigImportError("Your session is still starting. Wait a moment and try again.");
      return;
    }
    setConfigImportError("");
    setConfigImportBusy(true);
    try {
      const s = configToImport.session;
      const resp = await importTemplateRemote({
        session: s,
        annotated,
        clean,
        workspaceId,
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
      setImportWorkspaceId(resp.template_id);
      setImportTemplateDone(true);

      // Apply config session immediately (so the user lands back on their stage).
      applyImportedSession(s, resp.template_id);
      if (!s.templateSize || s.templateSize.width !== resp.width || s.templateSize.height !== resp.height) {
        setSlots(resp.slots);
        setParsedSlots(resp.slots.map((x) => ({ ...x })));
        setTemplateSize({ width: resp.width, height: resp.height });
        setConfigImportStatus(
          (prev) =>
            `${prev} The template you uploaded is a different size from the one in this config, so the freshly detected layout was used instead of the saved slot positions.`.trim()
        );
      }
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
        const outBlob = await cropToPngBlob(
          objectUrl,
          h.crop_area_pixels,
          h.export_size,
          typeof h.rotation_degrees === "number" ? h.rotation_degrees : 0
        );
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
  // Reloads/disconnects are tolerated; server-side expiry enforces retention.
  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;
    const ping = async () => {
      if (canceled) return;
      try {
        await touchWorkspace(workspaceId, {
          sessionId: clientSessionId || sessionIdentity.sessionId,
          startedAtMs: sessionIdentity.startedAtMs,
          expiresAtMs: sessionIdentity.expiresAtMs,
        });
      } catch {
        // ignore; server might be down or user is offline
      }
    };

    void ping();
    const interval = window.setInterval(() => {
      void ping();
    }, Math.max(5, workspaceHeartbeatSeconds) * 1000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [workspaceId, workspaceHeartbeatSeconds, clientSessionId, sessionIdentity.expiresAtMs, sessionIdentity.sessionId, sessionIdentity.startedAtMs]);

  // Hydrate workspace-scoped session/default state so another device opening the
  // same commercial workspace can continue with identical data.
  useEffect(() => {
    setWorkspaceDefaultsHydrated(false);
    if (!workspaceId) return;

    let canceled = false;
    (async () => {
      try {
        const state = await getWorkspaceState(workspaceId);
        if (canceled) return;

        const nextBaby = (state.default_baby_filename || null);
        const nextMugshots = Array.isArray(state.default_mugshot_filenames)
          ? state.default_mugshot_filenames.filter((v) => typeof v === "string" && v.trim())
          : [];
        const snap = state.session_snapshot;

        if (nextBaby) {
          setDefaultBabyFilename((prev) => prev || nextBaby);
        }
        if (nextMugshots.length > 0) {
          setDefaultMugshotFilenames((prev) => {
            if (prev.length > 0) return prev;
            return nextMugshots;
          });
        }

        if (snap && isPersistedSessionV1(snap)) {
          const saved = snap;
          setActiveStep(migrateActiveStep(saved.activeStep));
          setEditTab(saved.editTab ?? "layout");
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
          setDefaultBabyFilename(saved.defaultBabyFilename ?? (nextBaby || null));
          setBabyIngest({
            advancedNameMatch: Boolean(saved.babyIngest?.advancedNameMatch ?? true),
            partialNameMatch: Boolean(saved.babyIngest?.partialNameMatch ?? true),
            convertPdfs: Boolean(saved.babyIngest?.convertPdfs ?? true),
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
              : (saved.defaultMugshotFilename ? [saved.defaultMugshotFilename] : nextMugshots);
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
          const savedGenerationOutputs = saved.generationOutputs;
          if (savedGenerationOutputs?.previewPath) {
            setPreviewPath(savedGenerationOutputs.previewPath);
            setPreviewNonce((n) => n + 1);
          }
          const restoredOutputPaths = Array.isArray(savedGenerationOutputs?.outputPaths)
            ? savedGenerationOutputs.outputPaths.filter((v) => typeof v === "string" && v.trim())
            : [];
          if (restoredOutputPaths.length > 0) {
            setOutputPaths(restoredOutputPaths);
          }
          if (savedGenerationOutputs?.outputPath || restoredOutputPaths.length > 0) {
            setOutputPath(savedGenerationOutputs?.outputPath || restoredOutputPaths[0] || null);
            setOutputNonce((n) => n + 1);
          }
        }

        try {
          const listed = await generationListOutputs(workspaceId);
          if (canceled) return;

          const listedPreview = (listed.preview || "").trim() || null;
          const listedOutputs = Array.isArray(listed.outputs)
            ? listed.outputs.filter((v) => typeof v === "string" && v.trim())
            : [];

          if (listedPreview) {
            setPreviewPath(listedPreview);
            setPreviewNonce((n) => n + 1);
          }
          if (listedOutputs.length > 0) {
            setOutputPaths(listedOutputs);
            setOutputPath(listedOutputs[0] || null);
            setOutputNonce((n) => n + 1);
          }
        } catch {
          // Non-blocking: snapshot/local state still allows continuing the workflow.
        }
      } catch {
        // If this fails, keep local state behavior unchanged.
      } finally {
        if (!canceled) setWorkspaceDefaultsHydrated(true);
      }
    })();

    return () => {
      canceled = true;
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
      const saved = tryLoadSession(sessionTtlMs);
      if (saved) {
        const normalized = ensureSessionTiming(saved, Date.now(), sessionTtlMs);
        if (isSessionExpired(normalized)) {
          clearSession();
        } else {
          setSessionIdentity({
            sessionId: normalized.sessionId!,
            startedAtMs: normalized.startedAtMs!,
            expiresAtMs: normalized.expiresAtMs!,
          });
          setSessionRemainingMs(getRemainingSessionMs(normalized));
        }
      }

      const shouldUseSavedWorkspace = !initialWorkspaceId || initialWorkspaceId === saved?.workspaceId;

      // The server handed us a different workspace than the saved session
      // (restart or expiry): stash the saved settings as a backup before the
      // autosave persist effect overwrites them, and explain what happened.
      if (saved?.workspaceId && initialWorkspaceId && initialWorkspaceId !== saved.workspaceId) {
        try {
          window.localStorage.setItem(
            "ymga-session-backup-v1",
            JSON.stringify({ ...saved, saved_at: new Date().toISOString() })
          );
        } catch {
          // ignore quota / privacy mode; the notice below still applies
        }
        setStatus(
          "Your previous project's files are no longer on the server (the session expired or the server was restarted). Your settings were saved as a backup — use File → Upload config after re-uploading files, or start again."
        );
      }

      // Only auto-restore when starting fresh (avoid clobbering in-flight UI state).
      if (saved && shouldUseSavedWorkspace && !(workspaceId || templateId || people.length || slots.length)) {
        // Allow deep-linking: if /app?step=N is present, prefer that over the saved step.
        const urlStep =
          typeof window !== "undefined" && window.location.pathname === "/"
            ? parseStepFromSearch(window.location.search)
            : null;

        setActiveStep(urlStep ?? migrateActiveStep(saved.activeStep));
        setEditTab(saved.editTab ?? "layout");
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
          convertPdfs: Boolean(saved.babyIngest?.convertPdfs ?? true),
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
        const savedGenerationOutputs = saved.generationOutputs;
        if (savedGenerationOutputs?.previewPath) {
          setPreviewPath(savedGenerationOutputs.previewPath);
          setPreviewNonce((n) => n + 1);
        }
        const restoredOutputPaths = Array.isArray(savedGenerationOutputs?.outputPaths)
          ? savedGenerationOutputs.outputPaths.filter((v) => typeof v === "string" && v.trim())
          : [];
        if (restoredOutputPaths.length > 0) {
          setOutputPaths(restoredOutputPaths);
        }
        if (savedGenerationOutputs?.outputPath || restoredOutputPaths.length > 0) {
          setOutputPath(savedGenerationOutputs?.outputPath || restoredOutputPaths[0] || null);
          setOutputNonce((n) => n + 1);
        }

        if (saved.workspaceId) {
          // Use server-stored template for preview after refresh.
          setTemplatePreviewUrl(`${templateCleanUrl(saved.workspaceId)}&t=${Date.now()}`);
          setAnnotatedPreviewUrl(`${templateAnnotatedUrl(saved.workspaceId)}&t=${Date.now()}`);
          setCleanPreviewUrl(`${templateCleanUrl(saved.workspaceId)}&t=${Date.now()}`);
        }
      } else if (initialWorkspaceId) {
        setWorkspaceId(initialWorkspaceId);
        setTemplateId(initialWorkspaceId);
      }
    } finally {
      setDidRestoreSession(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkspaceId]);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, sessionIdentity.expiresAtMs - Date.now());
      setSessionRemainingMs(remaining);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sessionIdentity.expiresAtMs]);

  // Topbar countdown ticker — driven by the server-authoritative workspace-session
  // expiry (from /api/workspaces/resolve), not the client-side sessionIdentity above
  // (which only drives the local edit-cache restore/reset heuristic).
  useEffect(() => {
    if (serverSessionExpiryDisabled || serverSessionExpiresAtMs == null) {
      setServerSessionRemainingMs(0);
      return;
    }
    const tick = () => {
      setServerSessionRemainingMs(Math.max(0, serverSessionExpiresAtMs - Date.now()));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverSessionExpiresAtMs, serverSessionExpiryDisabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("ymga:session-timing", {
        detail: {
          remainingMs: serverSessionRemainingMs,
          expiresAtMs: serverSessionExpiresAtMs,
          ttlMs: sessionTtlMs,
          expiryDisabled: serverSessionExpiryDisabled,
        },
      })
    );
  }, [serverSessionExpiresAtMs, serverSessionRemainingMs, serverSessionExpiryDisabled, sessionTtlMs]);

  useEffect(() => {
    if (sessionRemainingMs > 0) {
      sessionExpiryHandledRef.current = false;
      return;
    }
    if (sessionExpiryHandledRef.current) return;
    sessionExpiryHandledRef.current = true;
    handleReset();
    setStatus(`Session expired after ${formatSessionDurationLabel(sessionTtlMs)}. Start a new session to continue.`);
    setShowSaveConfigReminder(false);
  }, [sessionRemainingMs, sessionTtlMs]);

  // URL -> state: allow /app?step=N to jump to a step (and restore after navigating back).
  useEffect(() => {
    if (!didRestoreSession) return;
    if (location.pathname !== "/") return;

    const urlStep = parseStepFromSearch(location.search);
    if (urlStep == null) return;
    if (urlStep === activeStepRef.current) return;
    goToStep(urlStep);
  }, [didRestoreSession, location.pathname, location.search]);

  // State -> URL: keep ?step= in sync (without spamming history).
  useEffect(() => {
    if (location.pathname !== "/") return;
    const current = parseStepFromSearch(location.search);
    if (current === activeStep) return;

    const next = new URLSearchParams(searchParams);
    next.set("step", String(activeStep));
    setSearchParams(next, { replace: true });
  }, [location.pathname, location.search, activeStep, searchParams, setSearchParams]);

  // Persist session as the user progresses.
  useEffect(() => {
    if (!didRestoreSession) return;
    const payload = buildSessionPayload();
    trySaveSession(payload, sessionTtlMs);

    if (!workspaceId || !workspaceDefaultsHydrated) return;

    const syncPayload = JSON.stringify({
      workspaceId,
      defaultBabyFilename,
      defaultMugshotFilenames,
      session: payload,
    });
    if (syncPayload === lastServerSyncedSnapshotRef.current) return;

    let canceled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await setWorkspaceState({
            workspaceId,
            defaultBabyFilename,
            defaultMugshotFilenames,
            sessionSnapshot: payload as unknown as Record<string, unknown>,
            sessionUpdatedAtMs: Date.now(),
          });
          if (!canceled) {
            lastServerSyncedSnapshotRef.current = syncPayload;
          }
        } catch {
          if (canceled) return;
          // Non-blocking; local session still works.
        }
      })();
    }, 300);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [
    didRestoreSession,
    activeStep,
    editTab,
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
    babyIngest,
    babyEditHistory,
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
    previewPath,
    outputPath,
    outputPaths,
    sessionTtlMs,
    sessionIdentity.expiresAtMs,
    sessionIdentity.sessionId,
    sessionIdentity.startedAtMs,
    workspaceDefaultsHydrated,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFlush = (event: Event) => {
      const detail = (event as CustomEvent<{ resolve?: () => void; reject?: (err?: unknown) => void }>).detail;

      if (!didRestoreSession || !workspaceId || !workspaceDefaultsHydrated) {
        detail?.resolve?.();
        return;
      }

      const payload = buildSessionPayload();
      const syncPayload = JSON.stringify({
        workspaceId,
        defaultBabyFilename,
        defaultMugshotFilenames,
        session: payload,
      });

      void (async () => {
        try {
          await setWorkspaceState({
            workspaceId,
            defaultBabyFilename,
            defaultMugshotFilenames,
            sessionSnapshot: payload as unknown as Record<string, unknown>,
            sessionUpdatedAtMs: Date.now(),
          });
          lastServerSyncedSnapshotRef.current = syncPayload;
          detail?.resolve?.();
        } catch (err) {
          detail?.reject?.(err);
        }
      })();
    };

    window.addEventListener("ymga:flush-workspace-state", onFlush as EventListener);
    return () => {
      window.removeEventListener("ymga:flush-workspace-state", onFlush as EventListener);
    };
  }, [
    didRestoreSession,
    workspaceId,
    workspaceDefaultsHydrated,
    defaultBabyFilename,
    defaultMugshotFilenames,
    activeStep,
    editTab,
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
    babyIngest,
    babyEditHistory,
    babyBackgroundColor,
    centerBabyOnFace,
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
    previewPath,
    outputPath,
    outputPaths,
    sessionTtlMs,
    sessionIdentity.expiresAtMs,
    sessionIdentity.sessionId,
    sessionIdentity.startedAtMs,
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

  // Gates Finalize's "Render preview"/"Render all" buttons (the only remaining consumer).
  const canContinue = useMemo(() => Boolean(people.length && slots.length), [people, slots]);

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

      if (activeStep === "generate") {
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
  }, [
    activeStep,
    allowInsecureReviewResults,
    allowInsecureUploads,
    dismissedToolMessageIds,
    insecureHttp,
    renderFailedMessage,
    showSaveConfigReminder,
  ]);

  const slotNumberToIndex = useMemo(() => {
    return computeSlotNumberToIndex(slots, placementMode, templateSize?.width);
  }, [slots, placementMode, templateSize?.width]);

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
    onError?: (message: string) => void;
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
        // Callers pass people already sorted and chunked (getPeopleForGeneration), so the
        // server must not re-sort a chunk.
        force_alphabetical: opts.peopleOverride ? false : forceAlphabetical,
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
      activeJobIdRef.current = jobId;
      if (opts.countUsage && gen.usage) setUsageInfo(gen.usage);

      const jobStartMs = performance.now();
      let lastProgress = -1;
      let lastStatusText = "";
      let lastChangeMs = Date.now();
      let pollIntervalMs = 400;

      while (true) {
        try {
          const statusResp = await generationStatus(jobId);

          const spreadPct = typeof statusResp.progress === "number" ? Math.max(0, Math.min(100, statusResp.progress)) : 0;
          const statusText = statusResp.status || "";
          let stuck = false;
          if (spreadPct !== lastProgress || statusText !== lastStatusText) {
            lastProgress = spreadPct;
            lastStatusText = statusText;
            lastChangeMs = Date.now();
          } else if (Date.now() - lastChangeMs >= 10 * 60 * 1000) {
            stuck = true;
            pollIntervalMs = 2000;
            setStatus("Rendering seems stuck (no progress for 10 minutes). Press Cancel, then try again.");
          }
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
          if (!suppressStatus && !stuck) {
            setStatus(parts.join(" — "));
          }

          if (statusResp.error) {
            const cancelled = cancelRequestedRef.current && statusResp.error === "generation_cancelled";
            const msg = cancelled ? "Rendering cancelled." : `Generation failed.\nserver message:\n${statusResp.error}`;
            activeJobIdRef.current = null;
            opts.onError?.(msg);
            if (!suppressStatus) {
              setStatus(msg);
            }
            if (manageLoading) {
              setLoading(false);
            }
            return null;
          }
          if (statusResp.output) {
            opts.onDone?.(statusResp.output);
            activeJobIdRef.current = null;
            if (!suppressStatus) {
              setStatus(opts.outputFilename ? "Preview ready" : "Generation complete");
              setProgress(100);
            }
            if (manageLoading) {
              setLoading(false);
            }
            return statusResp.output;
          }
          await new Promise((r) => setTimeout(r, pollIntervalMs));
        } catch (err) {
          console.error(err);
          activeJobIdRef.current = null;
          const msg = `Generation polling failed.\n${formatServerMessage(err)}`;
          opts.onError?.(msg);
          if (!suppressStatus) {
            setStatus(msg);
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
      activeJobIdRef.current = null;
      const base = opts.outputFilename ? "Preview generation failed" : "Generation failed";
      const msg = `${base}.\n${formatServerMessage(err)}`;
      opts.onError?.(msg);
      if (!suppressStatus) {
        setStatus(msg);
      }
      if (manageLoading) {
        setLoading(false);
      }
      return null;
    }
  };

  const handleCancelRender = async () => {
    cancelRequestedRef.current = true;
    const id = activeJobIdRef.current;
    if (id && workspaceId) {
      try {
        await cancelGeneration(id, workspaceId);
      } catch {
        /* status poll will surface it */
      }
    }
  };

  const handleRenderPreview = async () => {
    if (!workspaceId || !templateId) return;
    cancelRequestedRef.current = false;
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

    cancelRequestedRef.current = false;
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
    const maxParallel = 1;
    const ext = outputFormat === "pdf" ? "pdf" : outputFormat === "tiff" ? "tiff" : "png";
    const results: (string | null)[] = Array.from({ length: totalSpreads }, () => null);
    let completed = 0;
    let nextIndex = 0;
    let failed = false;
    let lastError: string | null = null;

    setLoading(true);
    setProgress(0);
    setStatus(`Rendering ${totalSpreads} spreads…`);

    const worker = async () => {
      while (true) {
        if (cancelRequestedRef.current) {
          failed = true;
          return;
        }
        if (failed) return;
        const spreadIdx = nextIndex;
        if (spreadIdx >= totalSpreads) return;
        nextIndex += 1;

        const start = spreadIdx * perSpread;
        const end = Math.min(peopleForAll.length, start + perSpread);
        const spreadPeople = peopleForAll.slice(start, end);
        const filename = `output_${String(spreadIdx + 1).padStart(totalSpreads >= 100 ? 3 : 2, "0")}.${ext}`;
        const out = await runGeneration({
          outputFilename: filename,
          peopleOverride: spreadPeople,
          spreadIndex: spreadIdx + 1,
          totalSpreads,
          overallStartMs,
          countUsage: spreadIdx === 0,
          suppressStatus: true,
          manageLoading: false,
          onError: (message) => {
            lastError = message;
          },
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
      if (cancelRequestedRef.current) {
        setStatus(`Rendering cancelled after ${completed} of ${totalSpreads} spreads.`);
      } else {
        setStatus(`Generation stopped at spread ${completed + 1} of ${totalSpreads}. The spreads already finished are still available below; fix the problem shown above and press Render all again.${lastError ? `\n${lastError}` : ""}`);
      }
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
  };

  useEffect(() => {
    if (activeStep !== "generate") return;
    if (!workspaceId || !templateId) return;
    if (!people.length || !slots.length) return;
    if (loading) return;
    if (previewPath) return;
    // Auto-render the one-page preview the first time you reach Finalize.
    handleRenderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, workspaceId, templateId, people.length, slots.length]);

  const roadmapItems: RoadmapItem<TopStep>[] = TOP_STEPS.map((s): RoadmapItem<TopStep> => {
    const ready = topStepReady(s.id);
    const status: RoadmapStatus =
      activeStep === s.id ? "current" : topStepComplete(s.id) ? "done" : "upcoming";
    return {
      id: s.id,
      label: s.label,
      description: s.description,
      icon: s.icon,
      status,
      optional: s.optional,
      disabled: !ready || loading,
      disabledReason: !ready ? "Complete the previous step first" : loading ? "Please wait…" : undefined,
    };
  });

  const stepsNav = (
    <RoadmapRail items={roadmapItems} active={activeStep} onSelect={goToStep} ariaLabel="Workflow steps" />
  );

  const activeStepMeta = TOP_STEPS.find((s) => s.id === activeStep) ?? TOP_STEPS[0];

  // Which pipeline cards / edit surface the current step exposes.
  //  - Template: an "Upload" sub-view (template upload card) and a "Review" sub-view (slot editor).
  //  - Uploads: all four upload cards (portraits + quotes + baby; the roster spreadsheet rides with portraits).
  //  - People: just the people review grid.
  //  - Style / Generate: a single surface each.
  const importSections: Array<"template" | "portraits" | "quotes" | "baby"> | null =
    activeStep === "template"
      ? templateView === "upload"
        ? ["template"]
        : null
      : activeStep === "roster"
      ? (["portraits", "quotes", "baby"] as const).filter(
          (section) =>
            (section !== "quotes" || quotesFeatureEnabled) && (section !== "baby" || babyPhotosFeatureEnabled)
        )
      : null;
  const showImportStep = importSections !== null;

  const editTabForStep: EditTab | null =
    activeStep === "template"
      ? templateView === "review"
        ? "layout"
        : null
      : activeStep === "people"
      ? "people"
      : activeStep === "style"
      ? "style"
      : null;
  const showEditStep =
    editTabForStep !== null &&
    (editTabForStep !== "layout" || templateReady) &&
    (editTabForStep !== "people" || rosterReady);

  const templateTabs: TabBarItem<"upload" | "review">[] = [
    { id: "upload", label: "Upload template", icon: <Upload size={14} /> },
    {
      id: "review",
      label: "Review parsing",
      icon: <Eye size={14} />,
      disabled: !templateReady,
      disabledReason: "Parse a template first",
    },
  ];

  const isFirstStep = stepIndex(activeStep) === 0;
  const isLastStep = stepIndex(activeStep) === TOP_STEPS.length - 1;
  const nextStepMeta = TOP_STEPS[stepIndex(activeStep) + 1] ?? null;

  // Shared Back / Reset all / Continue controls, rendered both in line with the
  // step description at the top (so the user doesn't have to scroll) and again
  // at the bottom.
  const backButton = (
    <button className="ghost" disabled={isFirstStep || loading} onClick={() => goToAdjacentStep(-1)}>
      <ArrowLeft size={15} /> Back
    </button>
  );
  const resetContinueButtons = (
    <div className="footer-right">
      <button type="button" className="danger ghost" onClick={requestResetAll} disabled={loading}>
        Reset all
      </button>
      {!isLastStep && (
        <button
          className="primary"
          disabled={loading || !nextStepMeta || !topStepReady(nextStepMeta.id)}
          onClick={() => goToAdjacentStep(1)}
        >
          Continue{nextStepMeta ? ` to ${nextStepMeta.label}` : ""} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
  const stepNavButtons = (
    <>
      {backButton}
      {resetContinueButtons}
    </>
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
      if (window.location.pathname !== "/") return;
      saveConfigActionRef.current?.();
    };

    const onUpload = () => {
      if (window.location.pathname !== "/") return;
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

  // "Load sample project" (from the Help panel): runs a small bundled template + roster + portraits
  // through the real pipeline so a first-time user instantly sees a populated, working project.
  const loadSampleRef = useRef<(() => void) | null>(null);
  loadSampleRef.current = () => {
    void (async () => {
      const fetchFile = async (url: string, name: string, type: string): Promise<File> => {
        const blob = await (await fetch(url)).blob();
        return new File([blob], name, { type });
      };
      const fetchAsPng = async (url: string, name: string): Promise<File> => {
        const blob = await (await fetch(url)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
        if (!png) throw new Error("Could not prepare sample template");
        return new File([png], name, { type: "image/png" });
      };
      try {
        setLoading(true);
        setProgress(0);
        if (!workspaceId) {
          setStatus("Could not load the sample project: your session is still starting. Wait a moment and try again.");
          return;
        }
        setStatus("Loading sample project — preparing template…");
        const annotated = await fetchAsPng(withBase("assets/Annotated Sample.webp"), "sample-annotated.png");
        const clean = await fetchAsPng(withBase("assets/Clean Sample.webp"), "sample-clean.png");
        updateAnnotatedFile(annotated);
        updateCleanFile(clean);
        setStatus("Loading sample project — detecting layout…");
        const parsed = await parseTemplate(annotated, clean, { minArea: parseMinArea, workspaceId: workspaceId || undefined });
        setTemplateId(parsed.template_id);
        setSlots(parsed.slots);
        setParsedSlots(parsed.slots.map((s) => ({ ...s })));
        setTemplateSize({ width: parsed.width, height: parsed.height });
        setTemplatePreviewUrl(`${templateCleanUrl(parsed.template_id)}&t=${Date.now()}`);

        setStatus("Loading sample project — matching photos…");
        const roster = await fetchFile(withBase("assets/sample/sample-roster.csv"), "sample-roster.csv", "text/csv");
        const portraits = await fetchFile(withBase("assets/sample/sample-portraits.zip"), "sample-portraits.zip", "application/zip");
        const ingest = await ingestSpreadsheet(parsed.template_id, roster, portraits, {
          namingPattern,
          advancedNameMatch: true,
        });
        setPeople(ingest.people);
        setOriginalPeople(ingest.people.map((p) => ({ ...p })));
        setTemplateView("review");
        setActiveStep("people");
        setStatus("Sample project loaded — explore the People step, then Style and Generate.");
      } catch (err) {
        setStatus(`Could not load the sample project. ${formatServerMessage(err)}`);
      } finally {
        setLoading(false);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("ymga:load-sample-done"));
      }
    })();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLoadSample = () => {
      if (window.location.pathname !== "/") return;
      loadSampleRef.current?.();
    };
    window.addEventListener("ymga:load-sample", onLoadSample);
    return () => window.removeEventListener("ymga:load-sample", onLoadSample);
  }, []);


  return (
    <>
      <ConfirmDialog
        open={showResetConfirm}
        title="Reset everything?"
        message="This permanently deletes your uploaded template, roster, photos, edits, and every setting in this session. This cannot be undone — export a config file first if you want to keep your work."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setShowResetConfirm(false);
          setShowResetConfirm2(true);
        }}
      />
      <ConfirmDialog
        open={showResetConfirm2}
        title="Are you absolutely sure?"
        message="This is irreversible. All work in this session will be permanently erased and the tool will reload to a clean slate."
        confirmLabel="Yes, reset everything"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setShowResetConfirm2(false)}
        onConfirm={() => {
          setShowResetConfirm2(false);
          performFullReset();
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
          <div className="modal" ref={configModalRef} tabIndex={-1}>
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

      {!embedded && (
        <div className="page">
          <header className="topbar tool-topbar">
            <div>
              <div className="topbar-title-row">
                <h1>Custom Flow Automator</h1>
                {configActions}
              </div>
              <p className="muted">Turn a template, roster, and photos into print-ready yearbook spreads.</p>
            </div>
          </header>
        </div>
      )}
      {toolMessages.length > 0 ? (
        <div className="page tool-messages-row">
          <ToolMessages
            messages={toolMessages}
            onDismiss={(id) => {
              setDismissedToolMessageIds((prev) => ({ ...prev, [id]: true }));
              if (id === "save-config-reminder") setShowSaveConfigReminder(false);
            }}
          />
        </div>
      ) : null}

      <div className="app-workspace">
        {stepsNav}
        <section className="app-canvas" aria-label={`${activeStepMeta.label} step`}>
          <div className="canvas-head">
            <h2 className="canvas-title">{activeStepMeta.label}</h2>
          </div>
          <div className="canvas-subheader">
            <div className="canvas-subheader-wing canvas-subheader-wing-left">{backButton}</div>
            <p className="canvas-sub">{activeStepMeta.description}</p>
            <div className="canvas-subheader-wing canvas-subheader-wing-right">{resetContinueButtons}</div>
          </div>
          {activeStep === "template" && (
            <div className="tool-tips-center tool-tips-top">
              <TipsBox tips={stepTips} />
            </div>
          )}
          {activeStep === "template" && (
            <div className="canvas-subnav">
              <TabBar
                items={templateTabs}
                active={templateView}
                onSelect={setTemplateView}
                size="small"
                ariaLabel="Template view"
              />
            </div>
          )}
          {showImportStep && (
            <ImportStep
              sections={importSections!}
              workspaceId={workspaceId}
              onParsed={(resp) => {
                setWorkspaceId(resp.template_id);
                setTemplateId(resp.template_id);
                setSlots(resp.slots);
                setParsedSlots(resp.slots.map((s) => ({ ...s })));
                setTemplateSize({ width: resp.width, height: resp.height });
                setTemplatePreviewUrl(`${templateCleanUrl(resp.template_id)}&t=${Date.now()}`);
                // Surface the result immediately by flipping the Template step to its Review sub-view.
                setTemplateView("review");
              }}
              skipQuotes={skipQuotes}
              onSkipQuotes={setSkipQuotes}
              skipBabyPhotos={skipBabyPhotos}
              onSkipBabyPhotos={setSkipBabyPhotos}
              setStatus={setStatus}
              setLoading={setLoading}
              setProgress={setProgress}
              loading={loading}
              status={status}
              progress={progress}
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
              namingPattern={namingPattern}
              setNamingPattern={setNamingPattern}
              advancedNameMatch={advancedNameMatch}
              setAdvancedNameMatch={setAdvancedNameMatch}
              allowInsecureUploads={allowInsecureUploads}
              portraitWarnings={portraitWarnings}
              onPortraitWarnings={setPortraitWarnings}
              portraitWarningsOpen={portraitWarningsOpen}
              onPortraitWarningsOpen={setPortraitWarningsOpen}
              portraitCompletedErrorCount={portraitCompletedErrorCount}
              onPortraitCompletedErrorCount={setPortraitCompletedErrorCount}
              people={people}
              setPeople={setPeople}
              setOriginalPeople={setOriginalPeople}
              quotesWarnings={quotesWarnings}
              onQuotesWarnings={setQuotesWarnings}
              quotesWarningsOpen={quotesWarningsOpen}
              onQuotesWarningsOpen={setQuotesWarningsOpen}
              quotesCompletedErrorCount={quotesCompletedErrorCount}
              onQuotesCompletedErrorCount={setQuotesCompletedErrorCount}
              defaultBabyFilename={defaultBabyFilename}
              onDefaultBabyFilename={setDefaultBabyFilename}
              babyZipWarnings={babyZipWarnings}
              onBabyZipWarnings={setBabyZipWarnings}
              babyZipWarningsOpen={babyZipWarningsOpen}
              onBabyZipWarningsOpen={setBabyZipWarningsOpen}
              babyCompletedErrorCount={babyCompletedErrorCount}
              onBabyCompletedErrorCount={setBabyCompletedErrorCount}
              babyIngest={babyIngest}
              onBabyIngest={setBabyIngest}
              setOriginalBabyPeople={setOriginalBabyPeople}
              babyBackgroundColor={babyBackgroundColor}
              onBabyBackgroundColor={setBabyBackgroundColor}
              centerBabyOnFace={centerBabyOnFace}
              onCenterBabyOnFace={setCenterBabyOnFace}
              backgroundRemovalOpsEnabled={backgroundRemovalOpsEnabled}
              centerOnFaceOpsEnabled={centerOnFaceOpsEnabled}
              advancedNameMatchingEnabled={advancedNameMatchingEnabled}
              onContinue={() => goToAdjacentStep(1)}
            />
          )}

          {showEditStep && (
            <EditStep
              editTab={editTabForStep ?? editTab}
              onEditTab={setEditTab}
              editTabReady={editTabReady}
              hideTabs
              skipQuotes={skipQuotes}
              skipBabyPhotos={skipBabyPhotos}
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
              workspaceId={workspaceId}
              people={people}
              setPeople={setPeople}
              originalPeople={originalPeople}
              setOriginalPeople={setOriginalPeople}
              originalBabyPeople={originalBabyPeople}
              lockedPeople={lockedPeople}
              onLockedPeople={setLockedPeople}
              defaultMugshotFilenames={defaultMugshotFilenames}
              onDefaultMugshotFilenames={setDefaultMugshotFilenames}
              defaultMugshotRandomize={defaultMugshotRandomize}
              onDefaultMugshotRandomize={setDefaultMugshotRandomize}
              defaultMugshotAssignments={defaultMugshotAssignments}
              ensureDefaultMugshotEagle={ensureDefaultMugshotEagle}
              defaultQuotes={defaultQuotes}
              onDefaultQuotes={setDefaultQuotes}
              defaultQuotesRandomize={defaultQuotesRandomize}
              onDefaultQuotesRandomize={setDefaultQuotesRandomize}
              defaultQuoteAssignments={defaultQuoteAssignments}
              defaultQuoteFallback={defaultQuoteFallback}
              defaultBabyFilename={defaultBabyFilename}
              babyBackgroundColor={babyBackgroundColor}
              babyBackgroundMode={babyIngest.backgroundMode as BackgroundMode}
              babyEditorProtectedFilenames={[
                ...babyEditHistory.flatMap((entry) => [entry.input_filename, entry.output_filename]),
                ...(originalBabyPeople ?? []).map((person) => person.baby_photo_filename ?? ""),
                ...(originalPeople ?? []).map((person) => person.baby_photo_filename ?? ""),
                defaultBabyFilename ?? "",
              ]}
              onBabyEditHistoryAdd={(entry) => setBabyEditHistory((prev) => [...prev, entry])}
              babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}
              allowInsecureUploads={allowInsecureUploads}
              setStatus={setStatus}
              loading={loading}
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
              availableFonts={availableFonts}
              setAvailableFonts={setAvailableFonts}
              customFontUploadEnabled={customFontUploadEnabled}
            />
          )}

          {activeStep === "generate" && (
            insecureHttp && !allowInsecureReviewResults ? (
              <p className="muted">Enable the toggle above to view results over HTTP.</p>
            ) : (
              <FinalizeStep
                people={people}
                peoplePerSpread={peoplePerSpread}
                skipQuotes={skipQuotes}
                skipBabyPhotos={skipBabyPhotos}
                templateSize={templateSize}
                outputSize={outputSize}
                onOutputSize={setOutputSize}
                outputFormat={outputFormat}
                onOutputFormat={setOutputFormat}
                placementMode={placementMode}
                onPlacementMode={setPlacementMode}
                forceAlphabetical={forceAlphabetical}
                onForceAlphabetical={setForceAlphabetical}
                alphabeticalSortOptionEnabled={alphabeticalSortOptionEnabled}
                pdfOutputEnabled={pdfOutputEnabled}
                tiffOutputEnabled={tiffOutputEnabled}
                loading={loading}
                canContinue={canContinue}
                handleRenderPreview={handleRenderPreview}
                handleRenderAll={handleRenderAll}
                onCancelRender={handleCancelRender}
                workspaceId={workspaceId}
                previewPath={previewPath}
                previewNonce={previewNonce}
                outputPath={outputPath}
                outputPaths={outputPaths}
                outputNonce={outputNonce}
                usageInfo={usageInfo}
              />
            )
          )}

          <div className="canvas-footer">{stepNavButtons}</div>
          {!showImportStep && status && !renderFailedMessage && (
            <p className="muted prewrap canvas-status">{prefixServerMessage(status)}</p>
          )}
          {!showImportStep && loading && progress > 0 && <ProgressBar progress={progress} />}
        </section>
      </div>
    </>
  );
}

