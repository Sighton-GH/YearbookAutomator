import type React from "react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2, CircleDashed, Loader2, Wand2, XCircle } from "lucide-react";
import {
  ingestSpreadsheet,
  parseTemplate,
  templateCleanUrl,
  uploadBabyZip,
  uploadImage,
  uploadQuotesSpreadsheet,
  type BackgroundMode,
  type PersonRecord,
  type RawParseDebug,
  type TemplateSlots,
} from "../api";
import { withBase } from "../baseUrl";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { InfoPopover } from "../components/InfoPopover";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NoticeDialog } from "../components/NoticeDialog";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { ProgressBar } from "../components/ProgressBar";
import { CompletionServerMessageWithWarningsLink } from "../components/WarningsCompletion";
import { formatServerMessage } from "../configFile";
import type { PersistedSessionV1 } from "../session";
import { formatEtaSeconds, prefixServerMessage } from "../utils/ui";
import { handleSpreadUploads } from "../utils/spreadUploadHandling";
import { rotateImageFile, rotateImageFileCounterClockwise } from "../utils/imageTransforms";

const EXAMPLE_TEMPLATE_CLEAN = withBase("assets/Clean Sample.webp");
const EXAMPLE_TEMPLATE_ANNOTATED = withBase("assets/Annotated Sample.webp");

type StageStatus = "pending" | "running" | "done" | "error";

type StageKind = "template" | "portraits" | "quotes" | "baby";

const OVERWRITE_MESSAGES: Record<StageKind, string> = {
  template: "Re-parsing the template will overwrite detected slot positions, including any manual adjustments made in the Layout tab.",
  portraits: "Re-ingesting the roster will overwrite the current people list, including any manual changes made in Edit.",
  quotes: "Re-uploading quotes will overwrite existing quote text for matched people.",
  baby: "Re-processing baby photos will overwrite existing baby photo assignments.",
};

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <CheckCircle2 size={18} className="stage-icon stage-icon-done" />;
  if (status === "running") return <Loader2 size={18} className="stage-icon stage-icon-running spin" />;
  if (status === "error") return <XCircle size={18} className="stage-icon stage-icon-error" />;
  return <CircleDashed size={18} className="stage-icon stage-icon-pending" />;
}

// Big, unmistakable process button for each stage. Idle = a large accent CTA; running = spinner +
// "Processing…"; done = a celebratory "Processed" badge (pops on appear) plus a quieter re-run link.
function ProcessButton({
  status,
  idleLabel,
  runningLabel,
  redoLabel,
  doneLabel,
  onRun,
  disabled,
}: {
  status: StageStatus;
  idleLabel: string;
  runningLabel: string;
  redoLabel: string;
  doneLabel: string;
  onRun: () => void;
  disabled?: boolean;
}) {
  if (status === "done") {
    return (
      <div className="process-row is-done">
        <span className="process-done-badge" role="status">
          <CheckCircle2 size={18} />
          {doneLabel}
        </span>
        <button type="button" className="process-redo small" onClick={onRun} disabled={disabled}>
          {redoLabel}
        </button>
      </div>
    );
  }
  const running = status === "running";
  return (
    <button
      type="button"
      className={clsx("process-btn", { "is-running": running, "is-error": status === "error" })}
      onClick={onRun}
      disabled={disabled || running}
    >
      {running ? <Loader2 size={18} className="spin" /> : <Wand2 size={18} />}
      <span>{running ? runningLabel : idleLabel}</span>
    </button>
  );
}

// Shared ETA-ticker used by every stage runner below: once upload bytes finish sending,
// the backend keeps processing for a bit longer with no progress events, so we fade into
// an estimated countdown (refined by a rolling average of how long that stage took last time).
function makeProcessingTicker(opts: {
  estimateRef: { current: number };
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  setStatus: (v: string) => void;
  label: string;
  base: number;
  weight: number;
}) {
  let interval: number | null = null;
  let uploadFinishedMs: number | null = null;
  const clear = () => {
    if (interval !== null) {
      window.clearInterval(interval);
      interval = null;
    }
  };
  const start = () => {
    if (interval !== null) return;
    const startMs = uploadFinishedMs ?? performance.now();
    interval = window.setInterval(() => {
      const elapsed = Math.max(0, (performance.now() - startMs) / 1000);
      const est = Math.max(1, opts.estimateRef.current);
      const remaining = Math.max(0, est - elapsed);
      opts.setProgress((prev) => {
        const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
        const weighted = opts.base + (pct * opts.weight) / 100;
        return Math.max(prev, Math.min(opts.base + opts.weight - 1, Math.round(weighted)));
      });
      opts.setStatus(`${opts.label}… ETA ${formatEtaSeconds(remaining)}`);
    }, 250);
  };
  return {
    onUploadDone: () => {
      if (uploadFinishedMs !== null) return;
      uploadFinishedMs = performance.now();
      start();
    },
    finish: (startedAtMs: number) => {
      clear();
      if (uploadFinishedMs !== null) {
        const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
        if (processingSeconds >= 0.25) {
          opts.estimateRef.current = 0.7 * opts.estimateRef.current + 0.3 * processingSeconds;
        }
      }
      void startedAtMs;
    },
  };
}

export function ImportStep({
  sections = ["template", "portraits", "quotes", "baby"],
  workspaceId,
  onParsed,
  skipQuotes,
  onSkipQuotes,
  skipBabyPhotos,
  onSkipBabyPhotos,
  setStatus,
  setLoading,
  setProgress,
  loading,
  status,
  progress,
  onPreviewChange,
  annotated,
  clean,
  annotatedPreview,
  cleanPreview,
  onAnnotatedChange,
  onCleanChange,
  peoplePerSpread,
  setPeoplePerSpread,
  mugshotColor,
  setMugshotColor,
  babyColor,
  setBabyColor,
  nameColor,
  setNameColor,
  quoteColor,
  setQuoteColor,
  minArea,
  setMinArea,
  onRawDebug,
  namingPattern,
  setNamingPattern,
  advancedNameMatch,
  setAdvancedNameMatch,
  allowInsecureUploads,
  portraitWarnings,
  onPortraitWarnings,
  portraitWarningsOpen,
  onPortraitWarningsOpen,
  portraitCompletedErrorCount,
  onPortraitCompletedErrorCount,
  people,
  setPeople,
  setOriginalPeople,
  quotesWarnings,
  onQuotesWarnings,
  quotesWarningsOpen,
  onQuotesWarningsOpen,
  quotesCompletedErrorCount,
  onQuotesCompletedErrorCount,
  defaultBabyFilename,
  onDefaultBabyFilename,
  babyZipWarnings,
  onBabyZipWarnings,
  babyZipWarningsOpen,
  onBabyZipWarningsOpen,
  babyCompletedErrorCount,
  onBabyCompletedErrorCount,
  babyIngest,
  onBabyIngest,
  setOriginalBabyPeople,
  babyBackgroundColor,
  onBabyBackgroundColor,
  centerBabyOnFace,
  onCenterBabyOnFace,
  backgroundRemovalOpsEnabled,
  centerOnFaceOpsEnabled,
  advancedNameMatchingEnabled,
  onContinue,
}: {
  /** Which pipeline cards to render. Lets the 5-step flow surface one card per step
   *  (e.g. just "template", or "quotes"+"baby" inside the People step). Defaults to all. */
  sections?: StageKind[];
  workspaceId: string | null;
  onParsed: (resp: { template_id: string; width: number; height: number; slots: TemplateSlots[] }) => void;
  skipQuotes: boolean;
  onSkipQuotes: (v: boolean) => void;
  skipBabyPhotos: boolean;
  onSkipBabyPhotos: (v: boolean) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  loading: boolean;
  status: string;
  progress: number;
  onPreviewChange?: (urls: { annotated?: string | null; clean?: string | null }) => void;
  annotated: File | null;
  clean: File | null;
  annotatedPreview: string | null;
  cleanPreview: string | null;
  onAnnotatedChange: (file: File | null) => void;
  onCleanChange: (file: File | null) => void;
  peoplePerSpread: number;
  setPeoplePerSpread: (n: number) => void;
  mugshotColor: string;
  setMugshotColor: (v: string) => void;
  babyColor: string;
  setBabyColor: (v: string) => void;
  nameColor: string;
  setNameColor: (v: string) => void;
  quoteColor: string;
  setQuoteColor: (v: string) => void;
  minArea: number;
  setMinArea: (n: number) => void;
  onRawDebug?: (debug: RawParseDebug | null) => void;
  namingPattern: string;
  setNamingPattern: (v: string) => void;
  advancedNameMatch: boolean;
  setAdvancedNameMatch: (v: boolean) => void;
  allowInsecureUploads: boolean;
  portraitWarnings: string[];
  onPortraitWarnings: (v: string[]) => void;
  portraitWarningsOpen: boolean;
  onPortraitWarningsOpen: (v: boolean) => void;
  portraitCompletedErrorCount: number | null;
  onPortraitCompletedErrorCount: (v: number | null) => void;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  setOriginalPeople: (p: PersonRecord[] | null) => void;
  quotesWarnings: string[];
  onQuotesWarnings: (v: string[]) => void;
  quotesWarningsOpen: boolean;
  onQuotesWarningsOpen: (v: boolean) => void;
  quotesCompletedErrorCount: number | null;
  onQuotesCompletedErrorCount: (v: number | null) => void;
  defaultBabyFilename: string | null;
  onDefaultBabyFilename: (v: string | null) => void;
  babyZipWarnings: string[];
  onBabyZipWarnings: (v: string[]) => void;
  babyZipWarningsOpen: boolean;
  onBabyZipWarningsOpen: (v: boolean) => void;
  babyCompletedErrorCount: number | null;
  onBabyCompletedErrorCount: (v: number | null) => void;
  babyIngest: NonNullable<PersistedSessionV1["babyIngest"]>;
  onBabyIngest: React.Dispatch<React.SetStateAction<NonNullable<PersistedSessionV1["babyIngest"]>>>;
  setOriginalBabyPeople: (p: PersonRecord[] | null) => void;
  babyBackgroundColor: string;
  onBabyBackgroundColor: (v: string) => void;
  centerBabyOnFace: boolean;
  onCenterBabyOnFace: (v: boolean) => void;
  backgroundRemovalOpsEnabled: boolean;
  centerOnFaceOpsEnabled: boolean;
  advancedNameMatchingEnabled: boolean;
  onContinue: () => void;
}) {
  // --- Template card state ---
  const [showCustomOptions, setShowCustomOptions] = useState(false);
  const [showMissingTemplate, setShowMissingTemplate] = useState(false);
  const [lowResWarning, setLowResWarning] = useState<string | null>(null);
  const [portraitReviewOpen, setPortraitReviewOpen] = useState(false);
  const [portraitReviewMessage, setPortraitReviewMessage] = useState<string | null>(null);
  const [autoDuplicatePortrait, setAutoDuplicatePortrait] = useState(false);
  const [annotatedPreviewOpen, setAnnotatedPreviewOpen] = useState(false);
  const [cleanPreviewOpen, setCleanPreviewOpen] = useState(false);
  const [templateRotating, setTemplateRotating] = useState(false);
  const lastHandledKeyRef = useRef<string | null>(null);
  const lowResResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);
  const portraitReviewResolverRef = useRef<((choice: "continue" | "cancel") => void) | null>(null);
  const templateEstimateRef = useRef(4);

  // --- Roster + Portraits card state ---
  const [sheet, setSheet] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [showMissingPortraits, setShowMissingPortraits] = useState(false);
  const [showAdvancedNaming, setShowAdvancedNaming] = useState(false);
  const portraitsEstimateRef = useRef(10);
  const defaultNamingPattern = "\\d{1,4}";

  // --- Quotes card state ---
  const [quotesSheet, setQuotesSheet] = useState<File | null>(null);
  const [quotesAdvancedNameMatch, setQuotesAdvancedNameMatch] = useState(true);
  const quotesEstimateRef = useRef(8);

  // --- Baby photos card state ---
  const [babyZip, setBabyZip] = useState<File | null>(null);
  const [babyFile, setBabyFile] = useState<File | null>(null);
  const [babyAdvancedNameMatch, setBabyAdvancedNameMatch] = useState(Boolean(babyIngest.advancedNameMatch ?? true));
  const [babyPartialNameMatch, setBabyPartialNameMatch] = useState(Boolean(babyIngest.partialNameMatch ?? true));

  // Admin-disabled advanced name matching forces every local "advanced/partial
  // matching" toggle off too, so a hidden checkbox can't leave stale state that
  // still gets sent to the backend on ingest.
  useEffect(() => {
    if (advancedNameMatchingEnabled) return;
    if (quotesAdvancedNameMatch) setQuotesAdvancedNameMatch(false);
    if (babyAdvancedNameMatch) {
      setBabyAdvancedNameMatch(false);
      onBabyIngest((prev) => ({ ...prev, advancedNameMatch: false }));
    }
    if (babyPartialNameMatch) {
      setBabyPartialNameMatch(false);
      onBabyIngest((prev) => ({ ...prev, partialNameMatch: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedNameMatchingEnabled, quotesAdvancedNameMatch, babyAdvancedNameMatch, babyPartialNameMatch]);
  const [convertPdfs, setConvertPdfs] = useState(Boolean(babyIngest.convertPdfs ?? true));
  const [removeBabyBackground, setRemoveBabyBackground] = useState(Boolean(babyIngest.removeBackground ?? false));
  const [babyBackgroundMode, setBabyBackgroundMode] = useState<BackgroundMode>(
    (babyIngest.backgroundMode as BackgroundMode) ?? "simple"
  );
  const [babyBgPickActive, setBabyBgPickActive] = useState(false);
  const [babyBgPickUrl, setBabyBgPickUrl] = useState<string | null>(null);
  const [babyBgPickBusy, setBabyBgPickBusy] = useState(false);
  const babyBgHexInputRef = useRef<HTMLInputElement | null>(null);
  const babyEstimateRef = useRef(12);

  useEffect(() => {
    return () => {
      if (babyBgPickUrl) URL.revokeObjectURL(babyBgPickUrl);
    };
  }, [babyBgPickUrl]);

  const rgbToHex = (r: number, g: number, b: number) => {
    const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  };

  // --- Stage statuses ---
  const [templateStage, setTemplateStage] = useState<StageStatus>(workspaceId ? "done" : "pending");
  const [portraitsStage, setPortraitsStage] = useState<StageStatus>(people.length > 0 ? "done" : "pending");
  const [quotesStage, setQuotesStage] = useState<StageStatus>("pending");
  const [babyStage, setBabyStage] = useState<StageStatus>("pending");
  const [stageError, setStageError] = useState<Partial<Record<"template" | "portraits" | "quotes" | "baby", string>>>({});
  const [importConfirm, setImportConfirm] = useState<{ missingQuote: boolean; missingBaby: boolean } | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState<{ kind: StageKind; run: () => void } | null>(null);

  const templateRef = useRef<HTMLDivElement | null>(null);
  const portraitsRef = useRef<HTMLDivElement | null>(null);
  const quotesRef = useRef<HTMLDivElement | null>(null);
  const babyRef = useRef<HTMLDivElement | null>(null);
  const portraitWarningsDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const quotesWarningsDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const babyWarningsDetailsRef = useRef<HTMLDetailsElement | null>(null);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  useEffect(() => {
    if (onPreviewChange) onPreviewChange({ annotated: annotatedPreview, clean: cleanPreview });
  }, [cleanPreview, annotatedPreview, onPreviewChange]);

  const normalizeHexColor = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const hex = withHash.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex.split("").map((ch) => ch + ch).join("").toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
    return null;
  };

  const scrollTo = (el: HTMLElement | null | undefined) => el?.scrollIntoView({ behavior: "smooth", block: "center" });

  // ---- Stage 1: template parsing ----
  const runTemplateStage = async (): Promise<boolean> => {
    const hasUpload = Boolean(annotated || clean);
    const missingAnnotated = !workspaceId && !annotated;
    const missingClean = !workspaceId && !clean;
    if (missingAnnotated || missingClean) {
      setShowMissingTemplate(true);
      const missing: string[] = [];
      if (missingAnnotated) missing.push("Annotated template (.png)");
      if (missingClean) missing.push("Clean template (.png)");
      setStatus(`Missing required file(s): ${missing.join(", ")}`);
      scrollTo(templateRef.current);
      return false;
    }

    let annotatedToParse = annotated;
    let cleanToParse = clean;
    if (annotated && clean) {
      const key = `${annotated.name}-${annotated.size}-${annotated.lastModified}-${clean.name}-${clean.size}-${clean.lastModified}`;
      if (lastHandledKeyRef.current !== key) {
        try {
          const handled = await handleSpreadUploads({
            annotated,
            clean,
            autoDuplicatePortrait,
            promptHandlers: {
              onLowResolution: (message) =>
                new Promise<"continue" | "cancel">((resolve) => {
                  lowResResolverRef.current = resolve;
                  setLowResWarning(message);
                }),
              onPortraitNeedsReview: (message) =>
                new Promise<"continue" | "cancel">((resolve) => {
                  portraitReviewResolverRef.current = resolve;
                  setPortraitReviewMessage(message);
                  setPortraitReviewOpen(true);
                }),
            },
          });
          if (handled.canceled) {
            setStatus("Upload canceled.");
            return false;
          }
          annotatedToParse = handled.annotated;
          cleanToParse = handled.clean;
          if (handled.didDuplicate || handled.didRotate) {
            onAnnotatedChange(annotatedToParse);
            onCleanChange(cleanToParse);
          }
          lastHandledKeyRef.current = `${annotatedToParse.name}-${annotatedToParse.size}-${annotatedToParse.lastModified}-${cleanToParse.name}-${cleanToParse.size}-${cleanToParse.lastModified}`;
        } catch (err) {
          console.error(err);
          setStatus("Failed to process the uploaded spread.");
          return false;
        }
      }
    }

    setTemplateStage("running");
    setStageError((prev) => ({ ...prev, template: undefined }));
    setProgress(0);
    setLoading(true);
    setStatus(hasUpload ? "Uploading templates..." : "Parsing template...");

    const ticker = makeProcessingTicker({
      estimateRef: templateEstimateRef,
      setProgress,
      setStatus,
      label: "Parsing template",
      base: 90,
      weight: 9,
    });
    const opStartMs = performance.now();
    try {
      if (hasUpload) {
        setProgress(1);
      } else {
        setProgress(90);
        ticker.onUploadDone();
      }
      const resp = await parseTemplate(annotatedToParse, cleanToParse, {
        workspaceId: workspaceId || undefined,
        mugshotColor: mugshotColor || undefined,
        babyColor: babyColor || undefined,
        nameColor: nameColor || undefined,
        quoteColor: quoteColor || undefined,
        disableBabyPhotos: skipBabyPhotos,
        disableQuotes: skipQuotes,
        minArea,
        onProgress: (pct) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
          const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
          setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));
          if (clamped >= 100) {
            ticker.onUploadDone();
            return;
          }
          let etaPart = "";
          if (clamped >= 2 && elapsed >= 0.25) {
            const etaSeconds = (elapsed * (100 - clamped)) / clamped;
            if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
          }
          setStatus(`Uploading templates… ${clamped}%${etaPart}`);
        },
      });
      ticker.finish(opStartMs);
      onParsed(resp);
      if (onRawDebug) onRawDebug(resp.raw_debug ?? null);
      setStatus("Template parsed successfully");
      setProgress(100);
      setTemplateStage("done");
      return true;
    } catch (err: any) {
      ticker.finish(opStartMs);
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || "Template parsing failed";
      setStatus(`Template parsing failed.\nserver message:\n${detail}`);
      setTemplateStage("error");
      setStageError((prev) => ({ ...prev, template: detail }));
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---- Stage 2: roster + portraits ----
  // Returns the freshly-ingested people list (or null on failure) rather than a bare boolean
  // so the cascade below can hand the *current* roster to quotes/baby instead of relying on
  // the `people` prop, which won't reflect this stage's setPeople() call until the next render.
  const runPortraitsStage = async (): Promise<PersonRecord[] | null> => {
    if (!workspaceId) {
      setStatus("Parse the template first");
      return null;
    }
    if (!sheet || !zip) {
      setShowMissingPortraits(true);
      const missing: string[] = [];
      if (!sheet) missing.push("Spreadsheet (.xlsx or .csv)");
      if (!zip) missing.push("Portraits ZIP (.zip)");
      setStatus(`Missing required file(s): ${missing.join(", ")}`);
      scrollTo(portraitsRef.current);
      return null;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return null;
    }

    setPortraitsStage("running");
    setStageError((prev) => ({ ...prev, portraits: undefined }));
    setProgress(0);
    setLoading(true);
    setStatus("Mapping spreadsheet and portraits...");
    onPortraitWarnings([]);
    onPortraitWarningsOpen(false);
    onPortraitCompletedErrorCount(null);

    const ticker = makeProcessingTicker({
      estimateRef: portraitsEstimateRef,
      setProgress,
      setStatus,
      label: "Processing portraits",
      base: 90,
      weight: 9,
    });
    const opStartMs = performance.now();
    try {
      const resp = await ingestSpreadsheet(workspaceId, sheet, zip, {
        namingPattern: namingPattern || undefined,
        advancedNameMatch,
        onProgress: (pct) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
          const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
          setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));
          if (clamped >= 100) {
            ticker.onUploadDone();
            return;
          }
          let etaPart = "";
          if (clamped >= 2 && elapsed >= 0.25) {
            const etaSeconds = (elapsed * (100 - clamped)) / clamped;
            if (Number.isFinite(etaSeconds)) etaPart = ` — ETA ${formatEtaSeconds(etaSeconds)}`;
          }
          setStatus(`Uploading portraits… ${clamped}%${etaPart}`);
        },
      });
      ticker.finish(opStartMs);
      setPeople(resp.people);
      setOriginalPeople(resp.people.map((p) => ({ ...p })));
      const nextWarnings = resp.warnings ?? [];
      onPortraitWarnings(nextWarnings);
      onPortraitCompletedErrorCount(nextWarnings.length);
      setStatus("Portrait mapping processing completed");
      setProgress(100);
      setPortraitsStage("done");
      return resp.people;
    } catch (err) {
      ticker.finish(opStartMs);
      console.error(err);
      setStatus(`Mapping failed.\n${formatServerMessage(err)}`);
      setPortraitsStage("error");
      setStageError((prev) => ({ ...prev, portraits: formatServerMessage(err) }));
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ---- Stage 3: quotes (optional) ----
  // `peopleOverride` lets the cascade pass the roster a prior stage in the *same* run just
  // produced (see runImportCascade) instead of the `people` prop, which is stale until the
  // next render — without it, quotes/baby would match against last batch's roster and then
  // clobber the freshly-ingested one when they call setPeople() with their own response.
  const runQuotesStage = async (peopleOverride?: PersonRecord[]): Promise<PersonRecord[] | null> => {
    const currentPeople = peopleOverride ?? people;
    if (!workspaceId || !currentPeople.length) {
      setStatus("Import the roster first");
      return null;
    }
    if (!quotesSheet) {
      scrollTo(quotesRef.current);
      return null;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return null;
    }

    setQuotesStage("running");
    setStageError((prev) => ({ ...prev, quotes: undefined }));
    setProgress(0);
    setLoading(true);
    setStatus("Uploading and matching quotes...");
    onQuotesWarnings([]);
    onQuotesWarningsOpen(false);
    onQuotesCompletedErrorCount(null);

    const ticker = makeProcessingTicker({
      estimateRef: quotesEstimateRef,
      setProgress,
      setStatus,
      label: "Processing quotes",
      base: 90,
      weight: 9,
    });
    const opStartMs = performance.now();
    try {
      const resp = await uploadQuotesSpreadsheet(workspaceId, currentPeople, quotesSheet, {
        advancedNameMatch: quotesAdvancedNameMatch,
        onProgress: (pct) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
          const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
          setProgress(Math.max(1, Math.min(90, Math.round(clamped * 0.9))));
          if (clamped >= 100) {
            ticker.onUploadDone();
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
      ticker.finish(opStartMs);
      setPeople(resp.people);
      const warnings = resp.warnings ?? [];
      onQuotesWarnings(warnings);
      onQuotesCompletedErrorCount(warnings.length);
      setStatus("Quote processing completed");
      setProgress(100);
      setQuotesStage("done");
      onSkipQuotes(false);
      return resp.people;
    } catch (err) {
      ticker.finish(opStartMs);
      console.error(err);
      setStatus(`Quote upload failed.\n${formatServerMessage(err)}`);
      setQuotesStage("error");
      setStageError((prev) => ({ ...prev, quotes: formatServerMessage(err) }));
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ---- Stage 4: baby photos (optional) ----
  // Same `peopleOverride` reasoning as runQuotesStage above: the cascade passes the roster
  // quotes just returned so the baby ZIP is matched against the current batch, not a stale one.
  const runBabyStage = async (peopleOverride?: PersonRecord[]): Promise<boolean> => {
    const currentPeople = peopleOverride ?? people;
    if (!workspaceId || !currentPeople.length) {
      setStatus("Import the roster first");
      return false;
    }
    if (!babyFile && !babyZip) {
      scrollTo(babyRef.current);
      return false;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return false;
    }

    setBabyStage("running");
    setStageError((prev) => ({ ...prev, baby: undefined }));
    setLoading(true);
    setProgress(0);
    onBabyZipWarningsOpen(false);
    onBabyCompletedErrorCount(null);
    setStatus("Processing baby photos...");

    try {
      if (babyFile) {
        const stageWeight = babyZip ? 20 : 100;
        const opStartMs = performance.now();
        setStatus("Uploading default baby…");
        const filename = await uploadImage(workspaceId, "baby", babyFile, {
          removeBackground: removeBabyBackground,
          backgroundMode: babyBackgroundMode,
          onProgress: (pct) => {
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
            const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
            setProgress(Math.max(1, Math.min(99, Math.round((clamped * stageWeight) / 100))));
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
        const ticker = makeProcessingTicker({
          estimateRef: babyEstimateRef,
          setProgress,
          setStatus,
          label: "Processing baby ZIP",
          base: stageBase,
          weight: stageWeight,
        });
        onBabyZipWarnings([]);
        onBabyCompletedErrorCount(null);
        const resp = await uploadBabyZip(workspaceId, currentPeople, babyZip, {
          advancedNameMatch: babyAdvancedNameMatch,
          partialNameMatch: babyAdvancedNameMatch && babyPartialNameMatch,
          convertPdfs,
          removeBackground: removeBabyBackground,
          backgroundMode: babyBackgroundMode,
          onProgress: (pct) => {
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
            const elapsed = Math.max(0, (performance.now() - opStartMs) / 1000);
            const weighted = stageBase + (clamped * stageWeight) / 100;
            setProgress(Math.max(1, Math.min(90, Math.round(weighted))));
            if (clamped >= 100) {
              ticker.onUploadDone();
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
        ticker.finish(opStartMs);
        setPeople(resp.people);
        setOriginalBabyPeople(resp.people.map((p) => ({ ...p })));
        const nextWarnings = resp.warnings ?? [];
        onBabyZipWarnings(nextWarnings);
        onBabyCompletedErrorCount(nextWarnings.length);
      }

      setStatus("Baby photo processing completed");
      setProgress(100);
      setBabyStage("done");
      onSkipBabyPhotos(false);
      return true;
    } catch (err) {
      console.error(err);
      setStatus(`Baby photo processing failed.\n${formatServerMessage(err)}`);
      setBabyStage("error");
      setStageError((prev) => ({ ...prev, baby: formatServerMessage(err) }));
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---- Cascade: "Process import" runs every applicable stage in order, then
  // explicitly advances to Edit. The overrides let a caller that just flipped
  // skipQuotes/skipBabyPhotos (via setState, which doesn't land until the next
  // render) act on the new value immediately instead of the stale closed-over prop.
  //
  // `currentPeople` is threaded explicitly through each stage rather than read back from the
  // `people` prop: setPeople() calls made earlier in this same cascade haven't landed in props
  // yet (no re-render has happened mid-await), so without this, quotes/baby would match against
  // last batch's roster and their response would overwrite the roster portraits just ingested.
  const runImportCascade = async (overrides?: { skipQuotesOverride?: boolean; skipBabyOverride?: boolean }) => {
    const effectiveSkipQuotes = overrides?.skipQuotesOverride ?? skipQuotes;
    const effectiveSkipBaby = overrides?.skipBabyOverride ?? skipBabyPhotos;
    if (templateStage !== "done") {
      const ok = await runTemplateStage();
      if (!ok) return;
    }
    let currentPeople = people;
    if (portraitsStage !== "done") {
      const result = await runPortraitsStage();
      if (!result) return;
      currentPeople = result;
    }
    if (!effectiveSkipQuotes && quotesSheet && quotesStage !== "done") {
      const result = await runQuotesStage(currentPeople);
      if (result) currentPeople = result;
    }
    if (!effectiveSkipBaby && (babyZip || babyFile) && babyStage !== "done") {
      await runBabyStage(currentPeople);
    }
    onContinue();
  };

  // ---- Single main action: confirm before continuing without quotes/baby photos ----
  const handleProcessImportClick = () => {
    const missingQuote = !skipQuotes && !quotesSheet;
    const missingBaby = !skipBabyPhotos && !babyZip && !babyFile;
    if (missingQuote || missingBaby) {
      setImportConfirm({ missingQuote, missingBaby });
      return;
    }
    void runImportCascade();
  };

  const handleConfirmMissingFiles = () => {
    const confirm = importConfirm;
    setImportConfirm(null);
    if (!confirm) return;
    if (confirm.missingQuote) onSkipQuotes(true);
    if (confirm.missingBaby) onSkipBabyPhotos(true);
    void runImportCascade({
      skipQuotesOverride: confirm.missingQuote ? true : undefined,
      skipBabyOverride: confirm.missingBaby ? true : undefined,
    });
  };

  const importConfirmMessage = importConfirm?.missingQuote && importConfirm?.missingBaby
    ? "You haven't added a quotes spreadsheet or baby photos. Continue without them?"
    : importConfirm?.missingQuote
      ? "You haven't added a quotes spreadsheet. Continue without quotes?"
      : importConfirm?.missingBaby
        ? "You haven't added baby photos. Continue without baby photos?"
        : undefined;

  // ---- Re-running an already-completed stage overwrites its data; confirm first ----
  const requestStageRun = (kind: StageKind, stage: StageStatus, run: () => void) => {
    if (stage === "done") {
      setOverwriteConfirm({ kind, run });
      return;
    }
    run();
  };

  const portraitsLocked = templateStage !== "done";
  // Quotes & baby photos match against the ingested people list, so they unlock once the roster
  // has been ingested (people exist). Shown alongside portraits in the Uploads step.
  const optionalLocked = portraitsStage !== "done" && people.length === 0;
  const missingAnnotatedUi = showMissingTemplate && !workspaceId && !annotated;
  const missingCleanUi = showMissingTemplate && !workspaceId && !clean;

  const show = (k: StageKind) => sections.includes(k);
  const fullImport = sections.length === 4;

  return (
    <div className="import-step stack">
      <ConfirmDialog
        open={Boolean(lowResWarning)}
        title="Low resolution spread"
        message={lowResWarning ?? undefined}
        confirmLabel="Continue"
        cancelLabel="Cancel upload"
        onCancel={() => {
          lowResResolverRef.current?.("cancel");
          lowResResolverRef.current = null;
          setLowResWarning(null);
        }}
        onConfirm={() => {
          lowResResolverRef.current?.("continue");
          lowResResolverRef.current = null;
          setLowResWarning(null);
        }}
      />
      <NoticeDialog
        open={portraitReviewOpen}
        title="Portrait spread check"
        message={portraitReviewMessage ?? undefined}
        actionLabel="Cancel"
        secondaryLabel="Continue"
        emphasizeAction
        onAction={() => {
          portraitReviewResolverRef.current?.("cancel");
          portraitReviewResolverRef.current = null;
          setPortraitReviewOpen(false);
          setPortraitReviewMessage(null);
        }}
        onSecondary={() => {
          portraitReviewResolverRef.current?.("continue");
          portraitReviewResolverRef.current = null;
          setPortraitReviewOpen(false);
          setPortraitReviewMessage(null);
        }}
      />
      <ImagePreviewDialog
        open={annotatedPreviewOpen}
        title="Annotated template preview"
        imageUrl={annotatedPreview}
        onClose={() => setAnnotatedPreviewOpen(false)}
        cancelLabel="Close"
        onCancel={() => setAnnotatedPreviewOpen(false)}
        onRotateClockwise={
          annotated && clean
            ? async () => {
                if (templateRotating) return;
                setTemplateRotating(true);
                try {
                  const [nextAnnotated, nextClean] = await Promise.all([rotateImageFile(annotated), rotateImageFile(clean)]);
                  onAnnotatedChange(nextAnnotated);
                  onCleanChange(nextClean);
                } finally {
                  setTemplateRotating(false);
                }
              }
            : undefined
        }
        onRotateCounterClockwise={
          annotated && clean
            ? async () => {
                if (templateRotating) return;
                setTemplateRotating(true);
                try {
                  const [nextAnnotated, nextClean] = await Promise.all([
                    rotateImageFileCounterClockwise(annotated),
                    rotateImageFileCounterClockwise(clean),
                  ]);
                  onAnnotatedChange(nextAnnotated);
                  onCleanChange(nextClean);
                } finally {
                  setTemplateRotating(false);
                }
              }
            : undefined
        }
        busy={templateRotating}
        hint="Rotating updates both annotated and clean templates to keep them aligned."
      />
      <ImagePreviewDialog
        open={cleanPreviewOpen}
        title="Clean template preview"
        imageUrl={cleanPreview}
        onClose={() => setCleanPreviewOpen(false)}
        cancelLabel="Close"
        onCancel={() => setCleanPreviewOpen(false)}
        busy={templateRotating}
      />
      <ConfirmDialog
        open={Boolean(importConfirm)}
        title="Continue without everything?"
        message={importConfirmMessage}
        confirmLabel="Continue"
        cancelLabel="Go back"
        onCancel={() => setImportConfirm(null)}
        onConfirm={handleConfirmMissingFiles}
      />
      <ConfirmDialog
        open={Boolean(overwriteConfirm)}
        title="Overwrite previous data?"
        message={overwriteConfirm ? OVERWRITE_MESSAGES[overwriteConfirm.kind] : undefined}
        confirmLabel="Overwrite"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setOverwriteConfirm(null)}
        onConfirm={() => {
          const run = overwriteConfirm?.run;
          setOverwriteConfirm(null);
          run?.();
        }}
      />

      {status && <p className="muted prewrap import-status">{prefixServerMessage(status)}</p>}
      {loading && progress > 0 && <ProgressBar progress={progress} />}

      {(fullImport || show("portraits")) && (
        <div className="import-process-all">
          <div className="muted small">
            Add your files below, then process everything in one go
            {fullImport ? " — template, roster & portraits" : " — roster & portraits"}
            {show("quotes") ? ", quotes" : ""}
            {show("baby") ? ", and baby photos" : ""}.
          </div>
          <button className="primary" onClick={handleProcessImportClick} disabled={loading}>
            {loading ? "Processing…" : fullImport ? "Process everything" : "Process all uploads"}
          </button>
        </div>
      )}

      {/* Card 1: Template */}
      {show("template") && (
      <div
        className={clsx("import-card panel", { "is-running": templateStage === "running", "is-done": templateStage === "done" })}
        ref={templateRef}
      >
        <div className="import-card-header">
          <StageIcon status={templateStage} />
          <h3>Template</h3>
        </div>

        <details className="muted small" style={{ marginBottom: 4 }}>
          <summary><strong>See an example template</strong></summary>
          <div className="ss-media-grid">
            <figure className="ss-figure">
              <img className="ss-img" src={EXAMPLE_TEMPLATE_CLEAN} alt="Clean template example" />
              <figcaption className="muted"><strong>Clean template:</strong> the background art with no coloured boxes.</figcaption>
            </figure>
            <figure className="ss-figure">
              <img className="ss-img" src={EXAMPLE_TEMPLATE_ANNOTATED} alt="Annotated template example" />
              <figcaption className="muted">
                <strong>Annotated template:</strong> same design with coloured guide boxes for mugshot (green), baby photo (blue), name (orange), and quote (red).
              </figcaption>
            </figure>
          </div>
        </details>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div>
            <div className="upload-title">Annotated template (.png)</div>
            {missingAnnotatedUi && <div className="upload-error"><span aria-hidden="true">❗</span> Please upload a file</div>}
            <UploadDropLabel
              accept="image/png"
              disabled={loading}
              className={missingAnnotatedUi ? "invalid" : undefined}
              onFile={(file) => {
                setShowMissingTemplate(false);
                onAnnotatedChange(file);
              }}
            >
              <input
                type="file"
                accept="image/png"
                onChange={(e) => {
                  setShowMissingTemplate(false);
                  onAnnotatedChange(e.target.files?.[0] ?? null);
                }}
              />
              {annotatedPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAnnotatedPreviewOpen(true);
                  }}
                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", width: "100%" }}
                >
                  <img src={annotatedPreview} alt="Annotated preview" className="template-thumb" />
                </button>
              )}
            </UploadDropLabel>
          </div>

          <div>
            <div className="upload-title">Clean template (.png)</div>
            {missingCleanUi && <div className="upload-error"><span aria-hidden="true">❗</span> Please upload a file</div>}
            <UploadDropLabel
              accept="image/png"
              disabled={loading}
              className={missingCleanUi ? "invalid" : undefined}
              onFile={(file) => {
                setShowMissingTemplate(false);
                onCleanChange(file);
              }}
            >
              <input
                type="file"
                accept="image/png"
                onChange={(e) => {
                  setShowMissingTemplate(false);
                  onCleanChange(e.target.files?.[0] ?? null);
                }}
              />
              {cleanPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCleanPreviewOpen(true);
                  }}
                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", width: "100%" }}
                >
                  <img src={cleanPreview} alt="Clean preview" className="template-thumb" />
                </button>
              )}
            </UploadDropLabel>
          </div>
        </div>

        <div className="callout">
          <ToggleSwitch checked={autoDuplicatePortrait} onChange={setAutoDuplicatePortrait} label="Duplicate page into spread" />
          <div className="muted small" style={{ marginTop: 6 }}>
            Enable this if you uploaded a single page and want it duplicated to form a full spread.
          </div>
        </div>

        <label className="field">
          <span className="inline" style={{ alignItems: "center", gap: 6 }}>
            <span>People per spread (max slots to keep)</span>
            <InfoPopover content="Slots beyond this count will be dropped during grouping." ariaLabel="People per spread description" />
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={peoplePerSpread}
            onChange={(e) => setPeoplePerSpread(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <div className="stack" style={{ gap: 8 }}>
          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <button type="button" onClick={() => setShowCustomOptions((v) => !v)}>
              {showCustomOptions ? "Hide advanced detection settings" : "Show advanced detection settings"}
            </button>
            <InfoPopover
              content="Optional tweaks for templates that don't parse cleanly with defaults. Hide steps you don't need, adjust detection sensitivity, or override the slot colours."
              ariaLabel="Custom options description"
              position="below"
            />
          </div>

          {showCustomOptions && (
            <div className="stack" style={{ gap: 12 }}>
              <ToggleSwitch
                checked={skipQuotes}
                onChange={onSkipQuotes}
                label="Disable quotes (skip detection)"
                description="The template parser will not look for quote boxes and quotes are not rendered."
              />
              <ToggleSwitch
                checked={skipBabyPhotos}
                onChange={onSkipBabyPhotos}
                label="Disable baby photos (skip detection)"
                description="The template parser will not look for baby cutouts and baby photos are not rendered."
              />

              <div className="color-overrides">
                {([
                  ["mugshotColorText", "Portrait colour override", mugshotColor, setMugshotColor, "#22c55e"],
                  ["babyColorText", "Baby colour override", babyColor, setBabyColor, "#3b82f6"],
                  ["nameColorText", "Name colour override", nameColor, setNameColor, "#ff751f"],
                  ["quoteColorText", "Quote colour override", quoteColor, setQuoteColor, "#ff3131"],
                ] as const).map(([id, label, value, setter, placeholder]) => (
                  <div className="field color-override" key={id}>
                    <label htmlFor={id}>{label}</label>
                    <div className="inline">
                      <input
                        type="color"
                        className="color-swatch"
                        aria-label={label}
                        value={value || placeholder}
                        onChange={(e) => setter(normalizeHexColor(e.target.value) ?? e.target.value)}
                      />
                      <input
                        id={id}
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        onBlur={(e) => {
                          const normalized = normalizeHexColor(e.target.value);
                          if (normalized) setter(normalized);
                        }}
                      />
                    </div>
                  </div>
                ))}
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
          )}
        </div>

        <div className="import-card-actions">
          <ProcessButton
            status={templateStage}
            idleLabel="Parse template"
            runningLabel="Parsing template…"
            doneLabel="Template parsed"
            redoLabel="Re-parse template"
            disabled={loading}
            onRun={() => requestStageRun("template", templateStage, () => void runTemplateStage())}
          />
          {stageError.template && <span className="upload-error">{stageError.template}</span>}
        </div>
      </div>

      )}

      {/* Card 2: Roster + Portraits */}
      {show("portraits") && (
      <div
        className={clsx("import-card panel", {
          "import-card-locked": portraitsLocked,
          "is-running": !portraitsLocked && portraitsStage === "running",
          "is-done": !portraitsLocked && portraitsStage === "done",
        })}
        ref={portraitsRef}
      >
        <div className="import-card-header">
          <StageIcon status={portraitsLocked ? "pending" : portraitsStage} />
          <h3>Roster &amp; Portraits</h3>
          <InfoPopover
            content="Upload a spreadsheet (.xlsx or .csv) and a portraits ZIP. Portrait files named with the row number (1.jpg, 01.jpg or 001.jpg → row 1) are matched first, with rows starting at 1 (header ignored). With Prioritize names enabled, filenames containing a student's first+last name are matched first. Non-matching files are skipped and listed in warnings."
            ariaLabel="Roster and portraits description"
            position="below"
          />
        </div>
        {portraitsLocked && <p className="muted small">Parse a template first to unlock this step.</p>}

        <fieldset disabled={portraitsLocked} className="import-card-fieldset">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <div>
              <div className="upload-title">Roster spreadsheet</div>
              {showMissingPortraits && !sheet && <div className="upload-error"><span aria-hidden="true">❗</span> Please upload a file</div>}
              <UploadDropLabel
                accept=".xlsx,.csv"
                disabled={loading || portraitsLocked}
                className={showMissingPortraits && !sheet ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissingPortraits(false);
                  setSheet(file);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setShowMissingPortraits(false);
                    setSheet(e.target.files?.[0] ?? null);
                  }}
                />
                {sheet && <span className="muted small">{sheet.name}</span>}
              </UploadDropLabel>
            </div>
            <div>
              <div className="upload-title">Portraits ZIP</div>
              {showMissingPortraits && !zip && <div className="upload-error"><span aria-hidden="true">❗</span> Please upload a file</div>}
              <UploadDropLabel
                accept=".zip"
                disabled={loading || portraitsLocked}
                className={showMissingPortraits && !zip ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissingPortraits(false);
                  setZip(file);
                }}
              >
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    setShowMissingPortraits(false);
                    setZip(e.target.files?.[0] ?? null);
                  }}
                />
                {zip && <span className="muted small">{zip.name}</span>}
              </UploadDropLabel>
            </div>
          </div>

          <ToggleSwitch
            checked={showAdvancedNaming}
            onChange={setShowAdvancedNaming}
            label="Advanced filename options"
            description="Change the regex used to extract the row number from portrait filenames."
          />
          {showAdvancedNaming && (
            <label className="field">
              <span className="inline" style={{ alignItems: "center", gap: 6 }}>
                <span>Filename pattern (regex)</span>
                <InfoPopover content="Default matches 1–4 digit stems (e.g., 1.jpg, 01.jpg or 001.jpg). Non-matching files are skipped." ariaLabel="Filename pattern description" />
              </span>
              <input type="text" value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} placeholder={defaultNamingPattern} />
            </label>
          )}
          {advancedNameMatchingEnabled && (
            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Prioritize names (case-insensitive)"
              description="Filenames containing FIRST+LAST map to that student first, then numbered portraits fill remaining rows."
            />
          )}

          {insecureHttp && (
            <ToggleSwitch checked={allowInsecureUploads} onChange={() => undefined} label="Uploads over HTTP" description="Contact an admin to allow insecure uploads." disabled />
          )}

          <div className="import-card-actions">
            <ProcessButton
              status={portraitsStage}
              idleLabel="Ingest roster"
              runningLabel="Ingesting roster…"
              doneLabel="Roster ingested"
              redoLabel="Re-ingest roster"
              disabled={loading || portraitsLocked}
              onRun={() => requestStageRun("portraits", portraitsStage, () => void runPortraitsStage())}
            />
            {stageError.portraits && <span className="upload-error">{stageError.portraits}</span>}
          </div>
          {portraitWarnings.length > 0 && (
            <>
              <CompletionServerMessageWithWarningsLink
                baseMessage="Portrait mapping completed"
                completedErrorCount={portraitCompletedErrorCount}
                detailsRef={portraitWarningsDetailsRef}
                setDetailsOpen={onPortraitWarningsOpen}
              />
              <details
                ref={portraitWarningsDetailsRef}
                open={portraitWarningsOpen}
                onToggle={(e) => onPortraitWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>{portraitWarnings.length} warning(s)</summary>
                <ul className="muted small">{portraitWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            </>
          )}
        </fieldset>
      </div>

      )}

      {/* Card 3: Quotes (optional) */}
      {show("quotes") && (
      <div
        className={clsx("import-card panel", {
          "import-card-skipped": skipQuotes,
          "is-running": !skipQuotes && quotesStage === "running",
          "is-done": !skipQuotes && quotesStage === "done",
        })}
        ref={quotesRef}
      >
        <div className="import-card-header">
          <StageIcon status={skipQuotes ? "pending" : quotesStage} />
          <h3>Quotes</h3>
          <span className="chip small">Optional</span>
        </div>
        {optionalLocked && <p className="muted small">Add your files now — they'll be processed automatically right after your roster when you use “Process all uploads”.</p>}
        {!optionalLocked && skipQuotes && (
          <p className="muted small">Turned off for this batch — add a spreadsheet below to turn quotes back on.</p>
        )}
        <fieldset className="import-card-fieldset">
          <div className="upload-title">Quotes spreadsheet (optional)</div>
          <UploadDropLabel accept=".xlsx,.csv" disabled={loading} onFile={setQuotesSheet}>
            <input type="file" accept=".xlsx,.csv" onChange={(e) => setQuotesSheet(e.target.files?.[0] ?? null)} />
            {quotesSheet && <span className="muted small">{quotesSheet.name}</span>}
          </UploadDropLabel>
          {advancedNameMatchingEnabled && (
            <ToggleSwitch
              checked={quotesAdvancedNameMatch}
              onChange={setQuotesAdvancedNameMatch}
              label="Advanced name matching"
              description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
            />
          )}
          <p className="muted small">You can also add or edit quotes per-person later in Edit — this upload is optional.</p>
          <div className="import-card-actions">
            <ProcessButton
              status={quotesStage}
              idleLabel="Upload quotes"
              runningLabel="Uploading quotes…"
              doneLabel="Quotes uploaded"
              redoLabel="Re-upload quotes"
              disabled={loading || optionalLocked || !quotesSheet}
              onRun={() => requestStageRun("quotes", quotesStage, () => void runQuotesStage())}
            />
            {stageError.quotes && <span className="upload-error">{stageError.quotes}</span>}
          </div>
          {quotesWarnings.length > 0 && (
            <>
              <CompletionServerMessageWithWarningsLink
                baseMessage="Quote processing completed"
                completedErrorCount={quotesCompletedErrorCount}
                detailsRef={quotesWarningsDetailsRef}
                setDetailsOpen={onQuotesWarningsOpen}
              />
              <details
                ref={quotesWarningsDetailsRef}
                open={quotesWarningsOpen}
                onToggle={(e) => onQuotesWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>{quotesWarnings.length} warning(s)</summary>
                <ul className="muted small">{quotesWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            </>
          )}
        </fieldset>
      </div>

      )}

      {/* Card 4: Baby photos (optional) */}
      {show("baby") && (
      <div
        className={clsx("import-card panel", {
          "import-card-skipped": skipBabyPhotos,
          "is-running": !skipBabyPhotos && babyStage === "running",
          "is-done": !skipBabyPhotos && babyStage === "done",
        })}
        ref={babyRef}
      >
        <div className="import-card-header">
          <StageIcon status={skipBabyPhotos ? "pending" : babyStage} />
          <h3>Baby Photos</h3>
          <span className="chip small">Optional</span>
        </div>
        {optionalLocked && <p className="muted small">Add your files now — they'll be processed automatically right after your roster when you use “Process all uploads”.</p>}
        {!optionalLocked && skipBabyPhotos && (
          <p className="muted small">Turned off for this batch — add a photo/ZIP below to turn baby photos back on.</p>
        )}
        <fieldset className="import-card-fieldset">
          <div className="upload-title">Baby photo ZIP (optional)</div>
            <UploadDropLabel accept=".zip" disabled={loading} onFile={setBabyZip}>
              <input type="file" accept=".zip" onChange={(e) => setBabyZip(e.target.files?.[0] ?? null)} />
              {babyZip && <span className="muted small">{babyZip.name}</span>}
            </UploadDropLabel>

            {advancedNameMatchingEnabled && (
              <>
                <ToggleSwitch
                  checked={babyAdvancedNameMatch}
                  onChange={(checked) => {
                    setBabyAdvancedNameMatch(checked);
                    onBabyIngest((prev) => ({ ...prev, advancedNameMatch: checked }));
                  }}
                  label="Advanced name matching"
                  description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
                />
                <ToggleSwitch
                  disabled={!babyAdvancedNameMatch}
                  checked={babyAdvancedNameMatch && babyPartialNameMatch}
                  onChange={(checked) => {
                    setBabyPartialNameMatch(checked);
                    onBabyIngest((prev) => ({ ...prev, partialNameMatch: checked }));
                  }}
                  label="Partial name matching"
                  description="Helps with minor typos/missing characters."
                />
              </>
            )}
            <ToggleSwitch
              checked={convertPdfs}
              onChange={(checked) => {
                setConvertPdfs(checked);
                onBabyIngest((prev) => ({ ...prev, convertPdfs: checked }));
              }}
              label="Convert PDFs in baby ZIP to images"
              description="If the ZIP contains .pdf files, the first page is converted to a PNG before matching."
            />

            <div className="stack" style={{ gap: 6 }}>
              <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                <strong>Default baby photo</strong>
                <InfoPopover content="Used when a student is missing a baby photo." ariaLabel="Default baby photo description" />
              </div>
              {workspaceId && defaultBabyFilename ? (
                <span className="muted small">Current default: {defaultBabyFilename}</span>
              ) : (
                <span className="muted small">Current default: ABC blocks (auto fallback)</span>
              )}
              <UploadDropLabel accept="image/*" disabled={loading} onFile={setBabyFile}>
                <span className="muted small">Upload default baby photo</span>
                <input type="file" accept="image/*" onChange={(e) => setBabyFile(e.target.files?.[0] ?? null)} />
              </UploadDropLabel>
            </div>

            <ToggleSwitch
              disabled={!backgroundRemovalOpsEnabled}
              checked={removeBabyBackground}
              onChange={(checked) => {
                setRemoveBabyBackground(checked);
                onBabyIngest((prev) => ({ ...prev, removeBackground: checked }));
              }}
              label="Remove background from baby photos"
              description={backgroundRemovalOpsEnabled ? "Uploads are saved with a transparent background." : "Disabled by admin settings for this device/server."}
            />
            {removeBabyBackground && (
              <div className="stack" style={{ gap: 10, marginLeft: 22 }}>
                {([
                  ["simple", "Simple backgrounds", "Best for solid/mostly-solid backgrounds."],
                  ["complex", "Complex backgrounds", "Best for real-life backgrounds (more intensive)."],
                  ["ultra_complex", "Ultra complex backgrounds", "Highest quality (ML-based). First run may be slower."],
                ] as const).map(([mode, label, description]) => (
                  <ToggleSwitch
                    key={mode}
                    checked={babyBackgroundMode === mode}
                    onChange={(checked) => {
                      if (checked) {
                        setBabyBackgroundMode(mode);
                        onBabyIngest((prev) => ({ ...prev, backgroundMode: mode }));
                      }
                    }}
                    label={label}
                    description={description}
                  />
                ))}
              </div>
            )}

            <ToggleSwitch
              disabled={!centerOnFaceOpsEnabled}
              checked={centerBabyOnFace}
              onChange={onCenterBabyOnFace}
              label="Center baby photo on face"
              description={
                centerOnFaceOpsEnabled
                  ? "During rendering, tries to detect a face in each baby photo and center it in the cutout."
                  : "Disabled by admin settings for this device/server."
              }
            />

            <div className="stack" style={{ gap: 8 }}>
              <ToggleSwitch
                checked={Boolean(babyBackgroundColor.trim())}
                onChange={(checked) => {
                  if (checked) {
                    const trimmed = babyBackgroundColor.trim();
                    onBabyBackgroundColor(normalizeHexColor(trimmed) ?? (trimmed || "#ffffff"));
                  } else {
                    onBabyBackgroundColor("");
                  }
                }}
                label="Baby photo background colour"
                description="If a baby image has transparent pixels, fill them with this colour during rendering."
              />
              {Boolean(babyBackgroundColor.trim()) && (
                <div className="stack" style={{ gap: 10, marginLeft: 22 }}>
                  <div className="field color-override" style={{ maxWidth: 360 }}>
                    <label htmlFor="babyBgColorTextImport">Fill colour</label>
                    <div className="inline">
                      <input
                        type="color"
                        className="color-swatch"
                        aria-label="Baby background fill colour"
                        value={normalizeHexColor(babyBackgroundColor) ?? "#ffffff"}
                        onChange={(e) => onBabyBackgroundColor(normalizeHexColor(e.target.value) ?? e.target.value)}
                      />
                      <input
                        id="babyBgColorTextImport"
                        type="text"
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

                  <div className="inline" style={{ gap: 10, alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={!workspaceId || babyBgPickBusy}
                      onClick={async () => {
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
                      {babyBgPickActive ? "Close template" : "Show template"}
                    </button>
                    <span className="muted small">Samples a pixel from the clean template and sets the fill colour.</span>
                  </div>

                  {babyBgPickActive && babyBgPickUrl && (
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
                  )}
                </div>
              )}
            </div>

            <p className="muted small">You can also add or edit baby photos per-person later in Edit — this upload is optional.</p>
            <div className="import-card-actions">
              <ProcessButton
                status={babyStage}
                idleLabel="Process baby photos"
                runningLabel="Processing baby photos…"
                doneLabel="Baby photos processed"
                redoLabel="Re-process baby photos"
                disabled={loading || optionalLocked || (!babyZip && !babyFile)}
                onRun={() => requestStageRun("baby", babyStage, () => void runBabyStage())}
              />
              {stageError.baby && <span className="upload-error">{stageError.baby}</span>}
            </div>
            {babyZipWarnings.length > 0 && (
              <>
                <CompletionServerMessageWithWarningsLink
                  baseMessage="Baby photo processing completed"
                  completedErrorCount={babyCompletedErrorCount}
                  detailsRef={babyWarningsDetailsRef}
                  setDetailsOpen={onBabyZipWarningsOpen}
                />
                <details
                  ref={babyWarningsDetailsRef}
                  open={babyZipWarningsOpen}
                  onToggle={(e) => onBabyZipWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary>{babyZipWarnings.length} warning(s)</summary>
                  <ul className="muted small">{babyZipWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              </>
            )}
        </fieldset>
      </div>
      )}
    </div>
  );
}
