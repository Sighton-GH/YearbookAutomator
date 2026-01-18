import type React from "react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import Cropper, { getInitialCropFromCroppedAreaPixels, type Area, type MediaSize } from "react-easy-crop";
import {
  assetUrl,
  babyMaskUrl,
  detectFaceCenter,
  fetchRemoveBackgroundPreviewResult,
  removeBackgroundPreviewStatus,
  startRemoveBackgroundPreviewJob,
  templateCleanUrl,
  uploadBabyZip,
  uploadImage,
  type BackgroundMode,
  type Box,
  type PersonRecord,
} from "../api";
import { withBase } from "../baseUrl";
import { ProgressBar } from "../components/ProgressBar";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { CompletionServerMessageWithWarningsLink } from "../components/WarningsCompletion";
import { formatServerMessage } from "../configFile";
import type { PersistedSessionV1 } from "../session";
import { cropToPngBlob } from "../utils/image";
import { formatEtaSeconds, prefixServerMessage, scrollPastTopBar } from "../utils/ui";

export function BabyPhotosStep({
  workspaceId,
  babyMaskBox,
  defaultBabyFilename,
  defaultQuoteFallback,
  defaultQuoteAssignments,
  defaultMugshotAssignments,
  onDefaultBabyFilename,
  babyZipWarnings,
  onBabyZipWarnings,
  babyZipWarningsOpen,
  onBabyZipWarningsOpen,
  babyCompletedErrorCount,
  onBabyCompletedErrorCount,
  babyIngest,
  onBabyIngest,
  onBabyEditHistoryAdd,
  babyBackgroundColor,
  onBabyBackgroundColor,
  centerBabyOnFace,
  onCenterBabyOnFace,
  allowInsecureUploads,
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
  defaultQuoteFallback: string;
  defaultQuoteAssignments: Record<number, string>;
  defaultMugshotAssignments: Record<number, string>;
  onDefaultBabyFilename: (v: string | null) => void;
  babyZipWarnings: string[];
  onBabyZipWarnings: (v: string[]) => void;
  babyZipWarningsOpen: boolean;
  onBabyZipWarningsOpen: (v: boolean) => void;
  babyCompletedErrorCount: number | null;
  onBabyCompletedErrorCount: (v: number | null) => void;
  babyIngest: NonNullable<PersistedSessionV1["babyIngest"]>;
  onBabyIngest: React.Dispatch<React.SetStateAction<NonNullable<PersistedSessionV1["babyIngest"]>>>;
  onBabyEditHistoryAdd: (entry: NonNullable<PersistedSessionV1["babyEditHistory"]>[number]) => void;
  babyBackgroundColor: string;
  onBabyBackgroundColor: (v: string) => void;
  centerBabyOnFace: boolean;
  onCenterBabyOnFace: (v: boolean) => void;
  allowInsecureUploads: boolean;
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
  const [showMissing, setShowMissing] = useState(false);
  const [advancedNameMatch, setAdvancedNameMatch] = useState(Boolean(babyIngest.advancedNameMatch ?? true));
  const [partialNameMatch, setPartialNameMatch] = useState(Boolean(babyIngest.partialNameMatch ?? true));
  const [convertPdfs, setConvertPdfs] = useState(Boolean(babyIngest.convertPdfs ?? false));
  const [removeBabyBackground, setRemoveBabyBackground] = useState(Boolean(babyIngest.removeBackground ?? false));
  const [babyBackgroundMode, setBabyBackgroundMode] = useState<BackgroundMode>(
    (babyIngest.backgroundMode as any) ?? "simple"
  );
  const [originalBabyPeople, setOriginalBabyPeople] = useState<PersonRecord[] | null>(null);
  const [originalDefaultBabyFilename, setOriginalDefaultBabyFilename] = useState<string | null>(null);
  const [babyThumbError, setBabyThumbError] = useState<Record<number, boolean>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [editingBaseSrc, setEditingBaseSrc] = useState<string | null>(null);
  const [editingFilename, setEditingFilename] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingBusy, setEditingBusy] = useState(false);
  const [editingAction, setEditingAction] = useState<"apply" | "remove_background" | null>(null);
  const [removeBgPopoverOpen, setRemoveBgPopoverOpen] = useState(false);
  const [centerFacePopoverOpen, setCenterFacePopoverOpen] = useState(false);
  const [centerFaceWorking, setCenterFaceWorking] = useState(false);
  const [centerFaceMessage, setCenterFaceMessage] = useState<string>("");
  const [removeBgMode, setRemoveBgMode] = useState<BackgroundMode>("simple");
  const [removeBgProgress, setRemoveBgProgress] = useState(0);
  const [removeBgEtaSeconds, setRemoveBgEtaSeconds] = useState<number | null>(null);
  const [removeBgMessage, setRemoveBgMessage] = useState<string>("");
  const [removeBgAlreadyRemoved, setRemoveBgAlreadyRemoved] = useState(false);
  const [lastRemoveBgForce, setLastRemoveBgForce] = useState(false);
  const [dirtyEdits, setDirtyEdits] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [showApplyWarning, setShowApplyWarning] = useState(false);
  const [showChangesSaved, setShowChangesSaved] = useState(false);
  const changesSavedTimerRef = useRef<number | null>(null);
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
  const [editorMediaSize, setEditorMediaSize] = useState<MediaSize | null>(null);
  const didInitDefaultBaby = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const babyZipProcessingEstimateSecondsRef = useRef<number>(12);
  const processingSnapshotRef = useRef<{
    people: PersonRecord[];
    defaultBabyFilename: string | null;
    babyZipWarnings: string[];
  } | null>(null);

  const babyZipRef = useRef<HTMLDivElement | null>(null);
  const babyZipWarningsRef = useRef<HTMLDetailsElement | null>(null);

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

  // Keep App-level persisted ingest settings in sync so config exports/imports work.
  useEffect(() => {
    setAdvancedNameMatch(Boolean(babyIngest.advancedNameMatch ?? true));
    setPartialNameMatch(Boolean(babyIngest.partialNameMatch ?? true));
    setConvertPdfs(Boolean(babyIngest.convertPdfs ?? false));
    setRemoveBabyBackground(Boolean(babyIngest.removeBackground ?? false));
    setBabyBackgroundMode(((babyIngest.backgroundMode as any) ?? "simple") as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [babyIngest]);

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
      if (changesSavedTimerRef.current !== null) {
        window.clearTimeout(changesSavedTimerRef.current);
        changesSavedTimerRef.current = null;
      }
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
    setEditorMediaSize(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setCenterFacePopoverOpen(false);
    setCenterFaceWorking(false);
    setCenterFaceMessage("");
    setRemoveBgMode(babyBackgroundMode);
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setRemoveBgAlreadyRemoved(false);
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setShowApplyWarning(false);
    setShowChangesSaved(false);
    if (changesSavedTimerRef.current !== null) {
      window.clearTimeout(changesSavedTimerRef.current);
      changesSavedTimerRef.current = null;
    }
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
    setEditorMediaSize(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setCenterFacePopoverOpen(false);
    setCenterFaceWorking(false);
    setCenterFaceMessage("");
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setRemoveBgAlreadyRemoved(false);
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setShowApplyWarning(false);
    setShowChangesSaved(false);
    if (changesSavedTimerRef.current !== null) {
      window.clearTimeout(changesSavedTimerRef.current);
      changesSavedTimerRef.current = null;
    }
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
    setEditorMediaSize(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setCenterFacePopoverOpen(false);
    setCenterFaceWorking(false);
    setCenterFaceMessage("");
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setRemoveBgAlreadyRemoved(false);
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setShowApplyWarning(false);
    setShowChangesSaved(false);
    if (changesSavedTimerRef.current !== null) {
      window.clearTimeout(changesSavedTimerRef.current);
      changesSavedTimerRef.current = null;
    }
    setStatus("Edits discarded");
  };

  const centerEditingOnFace = async () => {
    if (editingBusy) return;
    if (!editingSrc) return;

    if (!editorMediaSize || !editorCropSize) {
      setCenterFacePopoverOpen(true);
      setRemoveBgPopoverOpen(false);
      setCenterFaceWorking(false);
      setCenterFaceMessage("Initializing crop… please try again");
      window.setTimeout(() => {
        setCenterFacePopoverOpen(false);
        setCenterFaceMessage("");
      }, 1400);
      return;
    }

    if (!croppedAreaPixels) {
      setCenterFacePopoverOpen(true);
      setRemoveBgPopoverOpen(false);
      setCenterFaceWorking(false);
      setCenterFaceMessage("Initializing crop… move the photo slightly, then retry");
      window.setTimeout(() => {
        setCenterFacePopoverOpen(false);
        setCenterFaceMessage("");
      }, 1600);
      return;
    }

    setCenterFacePopoverOpen(true);
    setRemoveBgPopoverOpen(false);
    setCenterFaceWorking(true);
    setCenterFaceMessage("Detecting face…");

    try {
      const resp = await fetch(editingSrc);
      if (!resp.ok) throw new Error("Could not read image");
      const blob = await resp.blob();
      const fc = await detectFaceCenter(blob);

      if (!fc.found || fc.center_x == null || fc.center_y == null) {
        if (fc.reason === "unavailable") {
          setCenterFaceMessage("Face detection unavailable (missing OpenCV)");
        } else {
          setCenterFaceMessage("No face found");
        }
        return;
      }

      const imgW = editorMediaSize.naturalWidth;
      const imgH = editorMediaSize.naturalHeight;
      const fx = Math.max(0, Math.min(imgW, fc.center_x));
      const fy = Math.max(0, Math.min(imgH, fc.center_y));

      // Center the detected face within the *current* crop frame.
      // We do this by shifting the cropped rectangle (in source pixels) so its
      // center equals the face center, then using react-easy-crop's own inverse
      // mapping to compute the corresponding `crop` translation.
      const w = Math.max(1, Math.round(croppedAreaPixels.width));
      const h = Math.max(1, Math.round(croppedAreaPixels.height));
      const maxX = Math.max(0, imgW - w);
      const maxY = Math.max(0, imgH - h);
      const desiredArea: Area = {
        width: w,
        height: h,
        x: Math.max(0, Math.min(maxX, Math.round(fx - w / 2))),
        y: Math.max(0, Math.min(maxY, Math.round(fy - h / 2))),
      };

      const { crop: nextCrop, zoom: nextZoom } = getInitialCropFromCroppedAreaPixels(
        desiredArea,
        editorMediaSize,
        0,
        editorCropSize,
        0.5,
        3
      );

      setCrop(nextCrop);
      setZoom(Math.max(0.5, Math.min(3, nextZoom)));
      setDirtyEdits(true);
      setCenterFaceMessage("Centered on face");
    } catch (err) {
      console.error(err);
      setCenterFaceMessage("Could not detect face");
    } finally {
      setCenterFaceWorking(false);
      window.setTimeout(() => {
        setCenterFacePopoverOpen(false);
        setCenterFaceMessage("");
      }, 1400);
    }
  };

  const applyEdits = async () => {
    if (!workspaceId) return;
    if (editingIdx === null || !editingSrc) {
      setStatus("Could not apply changes");
      return;
    }
    if (!croppedAreaPixels) {
      setStatus("Initializing crop… please try again");
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
      if (personIndex == null) {
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

      try {
        if (editingFilename) {
          onBabyEditHistoryAdd({
            kind: "baby",
            person_index: personIndex,
            input_filename: editingFilename,
            output_filename: uploadedFilename,
            crop_area_pixels: { ...croppedAreaPixels },
            export_size: { ...exportSize },
            used_background_preview: hasPreview ? { background_mode: removeBgMode, force: Boolean(lastRemoveBgForce) } : null,
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // best-effort; don't block the edit applying
      }

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
      setShowChangesSaved(true);
      if (changesSavedTimerRef.current !== null) {
        window.clearTimeout(changesSavedTimerRef.current);
      }
      changesSavedTimerRef.current = window.setTimeout(() => {
        setShowChangesSaved(false);
        changesSavedTimerRef.current = null;
      }, 1400);
      setStatus("Baby photo updated");
    } catch (err) {
      console.error(err);
      setStatus("Could not apply changes");
    } finally {
      setEditingBusy(false);
      setEditingAction(null);
    }
  };

  const runBackgroundRemovalPreview = async ({ force }: { force: boolean }) => {
    if (!workspaceId || !editingFilename) return;
    if (editingBusy) return;
    setLastRemoveBgForce(Boolean(force));
    setEditingBusy(true);
    setEditingAction("remove_background");
    setRemoveBgProgress(1);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("Starting…");
    setRemoveBgAlreadyRemoved(false);
    try {
      const { job_id } = await startRemoveBackgroundPreviewJob({
        workspaceId,
        kind: "baby",
        filename: editingFilename,
        backgroundMode: removeBgMode,
        force,
      });

      const start = Date.now();
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
        // eslint-disable-next-line no-await-in-loop
        const s = await removeBackgroundPreviewStatus(job_id);
        setRemoveBgProgress(Math.max(1, Math.min(100, Math.round(s.progress ?? 0))));
        setRemoveBgEtaSeconds(typeof s.eta_seconds === "number" ? s.eta_seconds : null);
        setRemoveBgMessage(prefixServerMessage(s.message || "Working…"));

        if (s.status === "done") {
          if (s.already_removed) {
            setRemoveBgAlreadyRemoved(true);
            setRemoveBgMessage("Background already removed");
            setRemoveBgProgress(100);
            setStatus("Background already removed. If this is not true, force background removal.");
            break;
          }
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
          setStatus(s.error ? `Background removal failed.\nserver message:\n${s.error}` : "Background removal failed.");
          break;
        }
        if (Date.now() - start > 120_000) {
          setStatus("Background removal is taking unusually long. Please try again.");
          break;
        }
      }
    } catch (err) {
      console.error(err);
      setStatus(`Background removal failed.\n${formatServerMessage(err)}`);
    } finally {
      setEditingBusy(false);
      setEditingAction(null);
    }
  };

  const resetToOriginalPhotos = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset all baby photos back to the original result?");
      if (!ok) return;
    }
    if (!originalBabyPeople) {
      setStatus("No original baby photos to reset to");
      return;
    }
    setPeople(originalBabyPeople.map((p) => ({ ...p })));
    onDefaultBabyFilename(originalDefaultBabyFilename);
    setBabyThumbError({});
    setStatus("Reset to original baby photos");
  };

  const resetEditingToOriginal = () => {
    if (!workspaceId) return;
    if (editingIdx === null) return;
    const person = people[editingIdx];
    if (!person) return;
    if (!originalBabyPeople) {
      setStatus("No original baby photos to reset to");
      return;
    }
    const original = originalBabyPeople.find((p) => p.index === person.index);
    const originalFilename = original?.baby_photo_filename ?? null;
    updatePerson(editingIdx, (p) => ({ ...p, baby_photo_filename: originalFilename }));

    const filenameForEditor = originalFilename ?? defaultBabyFilename;
    if (!filenameForEditor) {
      setStatus("No original baby photo available to reset to");
      return;
    }

    const base = `${assetUrl(workspaceId, "baby", filenameForEditor)}&nonce=${Date.now()}`;
    setEditingFilename(filenameForEditor);
    setEditingBaseSrc(base);
    setEditingSrc(base);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setRemoveBgPopoverOpen(false);
    setCenterFacePopoverOpen(false);
    setCenterFaceWorking(false);
    setCenterFaceMessage("");
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setRemoveBgAlreadyRemoved(false);
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setShowApplyWarning(false);
    setShowChangesSaved(false);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setStatus("Reset to original");
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
      setStatus(`Upload failed.\n${formatServerMessage(err)}`);
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
    if (!babyFile && !babyZip) {
      setShowMissing(true);
      setStatus("Missing required input: select a baby ZIP and/or a default baby photo to process");
      babyZipRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    onBabyZipWarningsOpen(false);
    onBabyCompletedErrorCount(null);
    try {
      setStatus("Processing baby photos...");

      let nextDefaultBabyFilename = defaultBabyFilename;
      let nextPeople = people;
      let nextWarnings = babyZipWarnings;

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
        nextDefaultBabyFilename = filename;
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
        onBabyZipWarnings([]);
        onBabyCompletedErrorCount(null);
        const resp = await uploadBabyZip(workspaceId, people, babyZip, {
          advancedNameMatch,
          partialNameMatch: advancedNameMatch && partialNameMatch,
          convertPdfs,
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
        nextPeople = resp.people;
        nextWarnings = resp.warnings ?? [];
        setPeople(nextPeople);
        onBabyZipWarnings(nextWarnings);

        if (uploadFinishedMs !== null) {
          const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
          if (processingSeconds >= 0.25) {
            babyZipProcessingEstimateSecondsRef.current =
              0.7 * babyZipProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
          }
        }
      }

      // Snapshot the "original" results so the user can reset later.
      setOriginalBabyPeople(nextPeople.map((p) => ({ ...p })));
      setOriginalDefaultBabyFilename(nextDefaultBabyFilename);

      onBabyCompletedErrorCount(nextWarnings.length);
      setStatus("Baby photo processing completed");
      setProgress(100);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        setStatus("Processing cancelled");
      } else {
        console.error(err);
        setStatus(`Processing failed.\n${formatServerMessage(err)}`);
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
      onBabyZipWarnings(snap.babyZipWarnings);
    }

    setLoading(false);
    abortRef.current = null;
    processingSnapshotRef.current = null;
    setStatus("Processing cancelled");
    setProgress(0);
  };

  return (
    <>
      <div className="mapping-layout">
        <div className="mapping-main">
        <div className="panel">
          {workspaceId && people.length > 0 ? (
            <div className="stack">
              <div className="people-grid">
                {people.map((p, idx) => {
                  const babyFilename = p.baby_photo_filename || defaultBabyFilename;
                  const quote = (p.quote ?? defaultQuoteAssignments[p.index] ?? defaultQuoteFallback ?? "").trim();
                  const assignedDefaultMugshot = defaultMugshotAssignments[p.index];
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

                        <div className="thumb-stack">
                          <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                            <div className="muted small">Mugshot</div>
                            <div className="thumb-cell">
                              {p.mugshot_filename && workspaceId ? (
                                <img src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)} alt="portrait" className="thumb" />
                              ) : assignedDefaultMugshot && workspaceId ? (
                                <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                                  <img src={assetUrl(workspaceId, "mugshot", assignedDefaultMugshot)} alt="default portrait" className="thumb" />
                                  <div className="muted small">(default)</div>
                                </div>
                              ) : (
                                <div className="muted small">(missing)</div>
                              )}
                            </div>
                          </div>

                          <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                            <div className="muted small">Baby</div>
                            <div
                              className={clsx("thumb-cell", "thumb-cell-baby", canShowImage && "has-image")}
                              style={babyThumbStyle}
                            >
                              {babyFilename && workspaceId ? (
                                <img
                                  src={assetUrl(workspaceId, "baby", babyFilename)}
                                  alt="baby"
                                  className={clsx("thumb", "thumb-baby", maskUrl && "masked")}
                                  onClick={() => {
                                    if (!babyFilename) return;
                                    openCropper(idx, babyFilename);
                                  }}
                                  onError={() => setBabyThumbError((prev) => ({ ...prev, [p.index]: true }))}
                                />
                              ) : (
                                <div className="muted small">(missing)</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="stack" style={{ gap: 8 }}>
                        <label className="field">
                          <span>Quote</span>
                          <textarea
                            rows={2}
                            value={quote}
                            onChange={(e) => updatePerson(idx, (prev) => ({ ...prev, quote: e.target.value }))}
                            placeholder=""
                          />
                        </label>

                        <label className="field">
                          <span>Baby photo override</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleBabyOverride(idx, e.target.files?.[0] ?? null)}
                            disabled={loading}
                          />
                        </label>

                        <div className="inline" style={{ gap: 8, alignItems: "center" }}>
                          <button type="button" onClick={() => clearBabyOverride(idx)} disabled={loading}>
                            Clear override
                          </button>
                          <button type="button" onClick={() => clearBabyFromPerson(idx)} disabled={loading}>
                            Remove baby photo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="muted">No people loaded yet. Complete portrait mapping first.</p>
          )}
        </div>
      </div>

      <aside className="mapping-sidebar">
        <div className="panel">
          <div className="stack">
            <button type="button" className="danger" onClick={resetToOriginalPhotos} disabled={loading || !originalBabyPeople}>
              Reset to original photos
            </button>

            <p className="muted">
              Upload baby photos in two ways: (1) a ZIP to automatically match photos to students by filename, and (2) a default
              baby photo used when a student is missing one. Click <strong>Process</strong> to apply your selections. After processing, you can
              override per person (and click a thumbnail to crop to the template cutout).
            </p>

            <div ref={babyZipRef}>
              <div className="upload-title">Baby photo ZIP</div>
              {showMissing && !babyZip && !babyFile ? (
                <div className="upload-error">
                  <span aria-hidden="true">❗</span> Please upload a file
                </div>
              ) : null}
              <UploadDropLabel
                accept=".zip"
                disabled={loading}
                className={showMissing && !babyZip && !babyFile ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setBabyZip(file);
                }}
              >
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    setShowMissing(false);
                    setBabyZip(e.target.files?.[0] ?? null);
                  }}
                />
              </UploadDropLabel>
            </div>

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={(checked) => {
                setAdvancedNameMatch(checked);
                onBabyIngest((prev) => ({ ...prev, advancedNameMatch: checked }));
              }}
              label="Advanced name matching"
              description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
            />

            <ToggleSwitch
              disabled={!advancedNameMatch}
              checked={advancedNameMatch && partialNameMatch}
              onChange={(checked) => {
                setPartialNameMatch(checked);
                onBabyIngest((prev) => ({ ...prev, partialNameMatch: checked }));
              }}
              label="Partial name matching"
              description="Helps with minor typos/missing characters."
            />

            <ToggleSwitch
              checked={convertPdfs}
              onChange={(checked) => {
                setConvertPdfs(checked);
                onBabyIngest((prev) => ({ ...prev, convertPdfs: checked }));
              }}
              label="Convert PDFs in baby ZIP to images"
              description="If the ZIP contains .pdf files, the first page is converted to a PNG before matching/processing."
            />

            <div className={clsx("stack")} style={{ gap: 6 }}>
              <strong>Default baby photo</strong>
              <div className="muted small">Used when a student is missing a baby photo.</div>

              {workspaceId && defaultBabyFilename ? (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img src={assetUrl(workspaceId, "baby", defaultBabyFilename)} alt="default baby photo" className="thumb thumb-baby" />
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

              {showMissing && !babyZip && !babyFile ? (
                <div className="upload-error">
                  <span aria-hidden="true">❗</span> Please upload a file
                </div>
              ) : null}
              <UploadDropLabel
                accept="image/*"
                disabled={loading}
                className={showMissing && !babyZip && !babyFile ? "invalid" : undefined}
                onFile={(file) => setBabyFile(file)}
              >
                <span className="muted small">Upload default baby photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setShowMissing(false);
                    setBabyFile(e.target.files?.[0] ?? null);
                  }}
                />
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
              onChange={(checked) => {
                setRemoveBabyBackground(checked);
                onBabyIngest((prev) => ({ ...prev, removeBackground: checked }));
              }}
              label="Remove background from baby photos"
              description="When enabled, uploads are saved with a transparent background."
            />

            {removeBabyBackground && (
              <div className="stack" style={{ gap: 10, marginLeft: 22 }}>
                <ToggleSwitch
                  checked={babyBackgroundMode === "simple"}
                  onChange={(checked) => {
                    if (checked) {
                      setBabyBackgroundMode("simple");
                      onBabyIngest((prev) => ({ ...prev, backgroundMode: "simple" }));
                    }
                  }}
                  label="Simple backgrounds"
                  description="Best for solid/mostly-solid backgrounds."
                />

                <ToggleSwitch
                  checked={babyBackgroundMode === "complex"}
                  onChange={(checked) => {
                    if (checked) {
                      setBabyBackgroundMode("complex");
                      onBabyIngest((prev) => ({ ...prev, backgroundMode: "complex" }));
                    }
                  }}
                  label="Complex backgrounds"
                  description="Best for real-life backgrounds (more intensive)."
                />

                <ToggleSwitch
                  checked={babyBackgroundMode === "ultra_complex"}
                  onChange={(checked) => {
                    if (checked) {
                      setBabyBackgroundMode("ultra_complex");
                      onBabyIngest((prev) => ({ ...prev, backgroundMode: "ultra_complex" }));
                    }
                  }}
                  label="Ultra complex backgrounds"
                  description="Highest quality (ML-based). First run may be slower."
                />
              </div>
            )}

            <ToggleSwitch
              checked={centerBabyOnFace}
              onChange={onCenterBabyOnFace}
              label="Center baby photo on face"
              description="During rendering, tries to detect a face in each baby photo and center it in the cutout. If background removal is enabled, centering uses the background-removed image."
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
                <div className="stack" style={{ gap: 10, marginLeft: 22 }}>
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
                      {babyBgPickActive ? "Close template" : "Show template"}
                    </button>
                    <span className="muted small">Samples a pixel from the clean template and sets the fill colour.</span>
                  </div>

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
              )}
            </div>

            {babyZipWarnings.length > 0 && (
              <details
                ref={babyZipWarningsRef}
                className="muted small"
                open={babyZipWarningsOpen}
                onToggle={(e) => onBabyZipWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
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
            <CompletionServerMessageWithWarningsLink
              completedErrorCount={babyCompletedErrorCount}
              baseMessage="Baby photo processing completed"
              detailsRef={babyZipWarningsRef}
              setDetailsOpen={onBabyZipWarningsOpen}
            />
            {babyCompletedErrorCount === null && status ? (
              <p className="muted prewrap">{prefixServerMessage(status)}</p>
            ) : null}
            {loading && progress > 0 && <ProgressBar progress={progress} />}
          </div>
        </div>
      </aside>
    </div>

    {workspaceId && editingIdx !== null && editingSrc && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit baby photo">
        <div className="modal baby-editor-modal">
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
              <div className="baby-editor-toolbar">
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

                <div className="popover-anchor">
                  <button type="button" onClick={() => void centerEditingOnFace()} disabled={editingBusy}>
                    Center on face
                  </button>
                  {centerFacePopoverOpen && (
                    <div className="popover below" role="status" aria-live="polite">
                      <div className="stack" style={{ gap: 8 }}>
                        <div className="muted small">{centerFaceMessage || (centerFaceWorking ? "Working…" : "")}</div>
                        {centerFaceWorking && (
                          <div className="progress" aria-label="Face centering progress">
                            <div className="progress-bar" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button type="button" onClick={resetEditingToOriginal} disabled={editingBusy || !originalBabyPeople}>
                  Reset to original
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
                    <div className="popover below" role="dialog" aria-label="Background removal options">
                      <div className="stack" style={{ gap: 10 }}>
                        <div className="stack" style={{ gap: 2 }}>
                          <strong>Background removal</strong>
                          <div className="muted small">Choose a mode, then remove.</div>
                        </div>

                        <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                          <input type="radio" name="baby-bg-mode" checked={removeBgMode === "simple"} onChange={() => setRemoveBgMode("simple")} disabled={editingBusy} />
                          <span>Simple</span>
                          <span className="muted small">(solid backgrounds)</span>
                        </label>

                        <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                          <input type="radio" name="baby-bg-mode" checked={removeBgMode === "complex"} onChange={() => setRemoveBgMode("complex")} disabled={editingBusy} />
                          <span>Complex</span>
                          <span className="muted small">(real-life backgrounds)</span>
                        </label>

                        <label className="inline" style={{ alignItems: "center", gap: 8 }}>
                          <input type="radio" name="baby-bg-mode" checked={removeBgMode === "ultra_complex"} onChange={() => setRemoveBgMode("ultra_complex")} disabled={editingBusy} />
                          <span>Ultra complex</span>
                          <span className="muted small">(highest quality; heavier)</span>
                        </label>

                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="primary" onClick={() => void runBackgroundRemovalPreview({ force: false })} disabled={editingBusy}>
                            Remove
                          </button>
                          <button type="button" onClick={() => void runBackgroundRemovalPreview({ force: true })} disabled={editingBusy}>
                            Force
                          </button>
                        </div>

                        {removeBgAlreadyRemoved && (
                          <div className="callout warn">
                            <div className="muted small">Background already removed. If this is not true, force background removal.</div>
                          </div>
                        )}

                        {editingAction === "remove_background" && (
                          <div className="stack" style={{ gap: 6 }}>
                            <div className="inline" style={{ justifyContent: "space-between", gap: 10 }}>
                              <span className="muted small">{removeBgMessage || "Working…"}</span>
                              <span className="muted small">{removeBgEtaSeconds != null ? `ETA ${formatEtaSeconds(removeBgEtaSeconds)}` : ""}</span>
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

              <div className="baby-editor-scroll">
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
                    onMediaLoaded={(ms) => setEditorMediaSize(ms)}
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
                    <div className="popover-anchor">
                      <button type="button" onClick={() => setShowApplyWarning(true)} disabled={editingBusy || !croppedAreaPixels} aria-disabled={editingBusy || !croppedAreaPixels}>
                        Apply changes
                      </button>
                      {showChangesSaved && (
                        <div className="popover" role="status" aria-live="polite" style={{ width: "auto", padding: 8 }}>
                          <span className="muted small">Changes saved</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    )}

    {showApplyWarning && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm apply baby photo edits">
        <div className="modal" style={{ width: "min(560px, 100%)" }}>
            <div className="modal-header">
              <div className="stack" style={{ gap: 2 }}>
                <strong>Apply changes?</strong>
                <div className="muted small">Undo is not supported, but you can reset to original.</div>
              </div>
              <button type="button" onClick={() => setShowApplyWarning(false)} disabled={editingBusy}>
                Cancel
              </button>
            </div>
            <div className="modal-body">
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowApplyWarning(false)} disabled={editingBusy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setShowApplyWarning(false);
                    void applyEdits();
                  }}
                  disabled={editingBusy}
                >
                  Apply changes
                </button>
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
    </>
  );
}
