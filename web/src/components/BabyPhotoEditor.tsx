import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Cropper, { getInitialCropFromCroppedAreaPixels, type Area, type MediaSize } from "react-easy-crop";
import {
  assetUrl,
  babyMaskUrl,
  detectFaceCenter,
  fetchRemoveBackgroundPreviewResult,
  removeBackgroundPreviewStatus,
  startRemoveBackgroundPreviewJob,
  uploadImage,
  type BackgroundMode,
  type Box,
  type PersonRecord,
} from "../api";
import { formatServerMessage } from "../configFile";
import type { PersistedSessionV1 } from "../session";
import { cropToPngBlob } from "../utils/image";
import { formatEtaSeconds, prefixServerMessage } from "../utils/ui";
import { ConfirmDialog } from "./ConfirmDialog";

export type BabyPhotoEditorHandle = {
  openEditor: (idx: number) => void;
  closeEditor: () => void;
};

type BabyPhotoEditorProps = {
  workspaceId: string | null;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  defaultBabyFilename: string | null;
  babyMaskBox: Box | null;
  babyBackgroundColor: string;
  babyBackgroundMode: BackgroundMode;
  allowInsecureUploads: boolean;
  setStatus: (v: string) => void;
  originalBabyPeople?: PersonRecord[] | null;
  onBabyEditHistoryAdd?: (entry: NonNullable<PersistedSessionV1["babyEditHistory"]>[number]) => void;
};

export const BabyPhotoEditor = forwardRef<BabyPhotoEditorHandle, BabyPhotoEditorProps>(function BabyPhotoEditor(
  {
    workspaceId,
    people,
    setPeople,
    defaultBabyFilename,
    babyMaskBox,
    babyBackgroundColor,
    babyBackgroundMode,
    allowInsecureUploads,
    setStatus,
    originalBabyPeople = null,
    onBabyEditHistoryAdd,
  },
  ref
) {
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
  const [showResetWarning, setShowResetWarning] = useState(false);
  const removeBgCancelRef = useRef(false);
  const changesSavedTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const editorCropRef = useRef<HTMLDivElement | null>(null);
  const [editorCropSize, setEditorCropSize] = useState<{ width: number; height: number } | null>(null);
  const [editorMediaSize, setEditorMediaSize] = useState<MediaSize | null>(null);

  const maskUrl = workspaceId && babyMaskBox ? babyMaskUrl(workspaceId, babyMaskBox) : null;
  const cropAspect = babyMaskBox ? babyMaskBox.width / Math.max(1, babyMaskBox.height) : 1;
  const outSize = babyMaskBox
    ? { width: Math.max(1, Math.round(babyMaskBox.width)), height: Math.max(1, Math.round(babyMaskBox.height)) }
    : { width: 512, height: 512 };

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

  const babyFillColor = normalizeHexColor(babyBackgroundColor);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (changesSavedTimerRef.current !== null) {
        window.clearTimeout(changesSavedTimerRef.current);
        changesSavedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
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

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const openEditor = (idx: number) => {
    if (!workspaceId) return;
    const p = people[idx];
    const babyFilename = p?.baby_photo_filename ?? defaultBabyFilename;
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
    setRotation(0);
    setCroppedAreaPixels(null);
    setEditorMediaSize(null);
    setEditingAction(null);
    setRemoveBgPopoverOpen(false);
    setCenterFacePopoverOpen(false);
    setCenterFaceWorking(false);
    setCenterFaceMessage("");
    setRemoveBgMode(babyBackgroundMode ?? "simple");
    setRemoveBgProgress(0);
    setRemoveBgEtaSeconds(null);
    setRemoveBgMessage("");
    setRemoveBgAlreadyRemoved(false);
    setDirtyEdits(false);
    setShowDiscardWarning(false);
    setShowApplyWarning(false);
    setShowResetWarning(false);
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
    setRotation(0);
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
    setShowResetWarning(false);
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
    setRotation(0);
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
    setShowResetWarning(false);
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
    if (
      typeof window !== "undefined" &&
      !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
      window.location.protocol !== "https:" &&
      !allowInsecureUploads
    ) {
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

      const hasPreview = Boolean(previewUrlRef.current) && previewUrlRef.current === editingSrc;
      const srcForCrop = hasPreview ? editingSrc : (editingBaseSrc || editingSrc);

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

      const blob = await cropToPngBlob(srcForCrop, croppedAreaPixels, exportSize, rotation);
      const file = new File([blob], `baby_edit_${personIndex}_${Date.now()}.png`, { type: "image/png" });

      const uploadedFilename = await uploadImage(workspaceId, "baby", file);
      updatePerson(editingIdx, (p) => ({ ...p, baby_photo_filename: uploadedFilename }));

      try {
        if (editingFilename && onBabyEditHistoryAdd) {
          onBabyEditHistoryAdd({
            kind: "baby",
            person_index: personIndex,
            input_filename: editingFilename,
            output_filename: uploadedFilename,
            crop_area_pixels: { ...croppedAreaPixels },
            export_size: { ...exportSize },
            rotation_degrees: rotation,
            used_background_preview: hasPreview ? { background_mode: removeBgMode, force: Boolean(lastRemoveBgForce) } : null,
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // best-effort
      }

      const nextBase = `${assetUrl(workspaceId, "baby", uploadedFilename)}&nonce=${Date.now()}`;
      setEditingFilename(uploadedFilename);
      setEditingBaseSrc(nextBase);
      setEditingSrc(nextBase);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
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
    removeBgCancelRef.current = false;
    try {
      let sourceFilename = editingFilename;

      if (croppedAreaPixels && editingSrc) {
        setRemoveBgMessage("Cropping preview…");
        const cropW = Math.max(1, Math.round(croppedAreaPixels.width));
        const cropH = Math.max(1, Math.round(croppedAreaPixels.height));
        const minW = Math.max(1, Math.round(outSize.width));
        const minH = Math.max(1, Math.round(outSize.height));
        const desiredW = Math.max(minW, cropW);
        const desiredH = Math.max(minH, cropH);
        const MAX_PREVIEW_DIM = 1024;
        const scale = Math.min(1, MAX_PREVIEW_DIM / Math.max(desiredW, desiredH));
        const previewSize = {
          width: Math.max(minW, Math.round(desiredW * scale)),
          height: Math.max(minH, Math.round(desiredH * scale)),
        };

        const blob = await cropToPngBlob(editingSrc, croppedAreaPixels, previewSize, rotation);
        const tmpFile = new File([blob], `baby_preview_${Date.now()}.png`, { type: "image/png" });
        sourceFilename = await uploadImage(workspaceId, "baby", tmpFile);
      }

      const { job_id } = await startRemoveBackgroundPreviewJob({
        workspaceId,
        kind: "baby",
        filename: sourceFilename,
        backgroundMode: removeBgMode,
        force,
      });

      const start = Date.now();
      while (true) {
        if (removeBgCancelRef.current) {
          setRemoveBgMessage("Canceled");
          setStatus("Background removal canceled.");
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
        if (removeBgCancelRef.current) {
          setRemoveBgMessage("Canceled");
          setStatus("Background removal canceled.");
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        const s = await removeBackgroundPreviewStatus(job_id);
        if (removeBgCancelRef.current) {
          setRemoveBgMessage("Canceled");
          setStatus("Background removal canceled.");
          break;
        }
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

  useImperativeHandle(ref, () => ({ openEditor, closeEditor }), [openEditor]);

  return (
    <>
      {workspaceId && editingIdx !== null && editingSrc && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit baby photo">
          <ConfirmDialog
            open={showResetWarning}
            title="Reset to original?"
            message="This will discard your current edits for this baby photo and restore the original image."
            confirmLabel="Reset"
            cancelLabel="Cancel"
            destructive
            onCancel={() => setShowResetWarning(false)}
            onConfirm={() => {
              setShowResetWarning(false);
              resetEditingToOriginal();
            }}
          />
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

                <button
                  type="button"
                  onClick={() => {
                    setRotation((r) => (r - 90 + 360) % 360);
                    setDirtyEdits(true);
                  }}
                  disabled={editingBusy}
                  aria-label="Rotate counter-clockwise"
                  title="Rotate counter-clockwise"
                >
                  ↺
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRotation((r) => (r + 90) % 360);
                    setDirtyEdits(true);
                  }}
                  disabled={editingBusy}
                  aria-label="Rotate clockwise"
                  title="Rotate clockwise"
                >
                  ↻
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

                <button
                  type="button"
                  onClick={() => setShowResetWarning(true)}
                  disabled={editingBusy || !originalBabyPeople}
                >
                  Reset to original
                </button>

                <div className="popover-anchor">
                  <button
                    type="button"
                    onClick={() => {
                      if (editingBusy) return;
                      setRemoveBgMode(babyBackgroundMode ?? "simple");
                      setRemoveBgProgress(0);
                      setRemoveBgPopoverOpen((v) => !v);
                    }}
                    disabled={editingBusy}
                  >
                    Remove background
                  </button>

                  {editingAction === "remove_background" && (
                    <button
                      type="button"
                      onClick={() => {
                        removeBgCancelRef.current = true;
                        setRemoveBgMessage("Canceling…");
                      }}
                      disabled={!editingBusy}
                      style={{ marginLeft: 6 }}
                    >
                      Stop
                    </button>
                  )}

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
                            <div className="actions" style={{ justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editingAction) return;
                                  removeBgCancelRef.current = true;
                                  setRemoveBgMessage("Canceling…");
                                }}
                                disabled={!editingBusy}
                              >
                                Stop
                              </button>
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
                    rotation={rotation}
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
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
