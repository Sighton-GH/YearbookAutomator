import type React from "react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { applyMapping, assetUrl, babyMaskUrl, ingestSpreadsheet, uploadImage, type BackgroundMode, type Box, type PersonRecord } from "../api";
import { withBase } from "../baseUrl";
import { BabyPhotoEditor, type BabyPhotoEditorHandle } from "../components/BabyPhotoEditor";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProgressBar } from "../components/ProgressBar";
import { PeopleCard } from "../components/PeopleCard";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { InfoPopover } from "../components/InfoPopover";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { CompletionServerMessageWithWarningsLink } from "../components/WarningsCompletion";
import { TipsBox } from "../components/TipsBox";
import { formatServerMessage } from "../configFile";
import type { PersistedSessionV1 } from "../session";
import { formatEtaSeconds, prefixServerMessage } from "../utils/ui";

const sidebarTips = [
  "Server deletes all data after 8 hours to protect privacy.",
  "Non-matching portrait filenames are skipped—check warnings to see which files weren't used.",
  "Use the filename regex to match row numbers (rows are 1-based, header is ignored).",
];

export function MugshotMapping({
  workspaceId,
  defaultMugshotFilenames,
  onDefaultMugshotFilenames,
  defaultMugshotRandomize,
  onDefaultMugshotRandomize,
  defaultMugshotAssignments,
  defaultBabyFilename,
  babyBackgroundColor,
  babyBackgroundMode,
  onBabyEditHistoryAdd,
  babyMaskBox,
  defaultQuoteAssignments,
  defaultQuoteFallback,
  lockedPeople,
  onLockedPeople,
  ensureDefaultMugshotEagle,
  namingPattern,
  setNamingPattern,
  advancedNameMatch,
  setAdvancedNameMatch,
  allowInsecureUploads,
  warnings,
  onWarnings,
  warningsOpen,
  onWarningsOpen,
  completedErrorCount,
  onCompletedErrorCount,
  onMapped,
  setStatus,
  setLoading,
  setProgress,
  loading,
  people,
  setPeople,
  originalPeople,
  setOriginalPeople,
  status,
  progress,
  canContinue,
  onBack,
  onReset,
  onContinue,
}: {
  workspaceId: string | null;
  defaultMugshotFilenames: string[];
  onDefaultMugshotFilenames: React.Dispatch<React.SetStateAction<string[]>>;
  defaultMugshotRandomize: boolean;
  onDefaultMugshotRandomize: (v: boolean) => void;
  defaultMugshotAssignments: Record<number, string>;
  defaultBabyFilename: string | null;
  babyBackgroundColor: string;
  babyBackgroundMode: BackgroundMode;
  onBabyEditHistoryAdd: (entry: NonNullable<PersistedSessionV1["babyEditHistory"]>[number]) => void;
  babyMaskBox: Box | null;
  defaultQuoteAssignments: Record<number, string>;
  defaultQuoteFallback: string;
  lockedPeople: Record<number, true>;
  onLockedPeople: React.Dispatch<React.SetStateAction<Record<number, true>>>;
  ensureDefaultMugshotEagle: () => Promise<string | null>;
  namingPattern: string;
  setNamingPattern: (v: string) => void;
  advancedNameMatch: boolean;
  setAdvancedNameMatch: (v: boolean) => void;
  allowInsecureUploads: boolean;
  warnings: string[];
  onWarnings: (v: string[]) => void;
  warningsOpen: boolean;
  onWarningsOpen: (v: boolean) => void;
  completedErrorCount: number | null;
  onCompletedErrorCount: (v: number | null) => void;
  onMapped: (people: PersonRecord[]) => void;
  setStatus: (v: string) => void;
  setLoading: (v: boolean) => void;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  loading: boolean;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  originalPeople: PersonRecord[] | null;
  setOriginalPeople: (p: PersonRecord[] | null) => void;
  status: string;
  progress: number;
  canContinue: boolean;
  onBack: () => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  type SwapMode = "off" | "card" | "portrait";

  const [sheet, setSheet] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const defaultNamingPattern = "\\d{3,4}";
  const [showAdvancedNaming, setShowAdvancedNaming] = useState(false);
  const [adjustments, setAdjustments] = useState<
    Record<number, { shiftEnabled?: boolean; shiftCount?: number; replacement_mugshot?: string; remove?: boolean }>
  >({});
  const [adjustmentsResetNonce, setAdjustmentsResetNonce] = useState(0);
  const [swapMode, setSwapMode] = useState<SwapMode>("off");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [swapsPerformed, setSwapsPerformed] = useState(false);
  const [defaultDragIdx, setDefaultDragIdx] = useState<number | null>(null);
  const [animatePeopleIn, setAnimatePeopleIn] = useState(false);
  const [animateSidebarCollapse, setAnimateSidebarCollapse] = useState(false);
  const prevPeopleCountRef = useRef(people.length);

  const ingestProcessingEstimateSecondsRef = useRef<number>(10);
  const didScrollForProgressRef = useRef(false);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Portrait preview");
  const [previewRotation, setPreviewRotation] = useState(0);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const zipRef = useRef<HTMLDivElement | null>(null);
  const warningsRef = useRef<HTMLDetailsElement | null>(null);
  const babyEditorRef = useRef<BabyPhotoEditorHandle>(null);

  const didInitDefaultMugshot = useRef(false);
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "remove-person"; personIndex: number }
    | { kind: "remove-portrait"; personIndex: number }
    | { kind: "reset-mapping" }
    | { kind: "apply-mapping" }
    | { kind: "reset-all" }
    | null
  >(null);

  const swapEnabled = swapMode !== "off";

  useEffect(() => {
    // Avoid leaving stale drag highlights around when switching modes.
    setDragIdx(null);
    setDropTarget(null);
  }, [swapMode]);

  useEffect(() => {
    const prevCount = prevPeopleCountRef.current;
    if (prevCount === 0 && people.length > 0) {
      setAnimatePeopleIn(true);
      setAnimateSidebarCollapse(true);
      const timer = window.setTimeout(() => {
        setAnimatePeopleIn(false);
        setAnimateSidebarCollapse(false);
      }, 700);
      prevPeopleCountRef.current = people.length;
      return () => window.clearTimeout(timer);
    }
    prevPeopleCountRef.current = people.length;
  }, [people.length]);

  useEffect(() => {
    if (!workspaceId) return;
    if (defaultMugshotFilenames.length > 0) return;
    if (didInitDefaultMugshot.current) return;

    (async () => {
      try {
        const filename = await ensureDefaultMugshotEagle();
        if (filename) {
          didInitDefaultMugshot.current = true;
          onDefaultMugshotFilenames((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
        }
      } catch (err) {
        console.error(err);
        didInitDefaultMugshot.current = false;
      }
    })();
  }, [workspaceId, defaultMugshotFilenames.length, ensureDefaultMugshotEagle, onDefaultMugshotFilenames]);

  useEffect(() => {
    if (!loading || progress <= 0) {
      didScrollForProgressRef.current = false;
      return;
    }
    if (didScrollForProgressRef.current) return;
    didScrollForProgressRef.current = true;
    statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, progress]);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const maskUrl = workspaceId && babyMaskBox ? babyMaskUrl(workspaceId, babyMaskBox) : null;
  const thumbSizeForAspect = (maxSize: number, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
    if (aspect >= 1) return { width: maxSize, height: Math.max(1, Math.round(maxSize / aspect)) };
    return { width: Math.max(1, Math.round(maxSize * aspect)), height: maxSize };
  };
  const cropAspect = babyMaskBox ? babyMaskBox.width / Math.max(1, babyMaskBox.height) : 1;
  const babyThumbDims = thumbSizeForAspect(96, cropAspect);

  const handleIngest = async () => {
    // Make sure the user can see status/progress updates.
    statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!workspaceId) {
      setStatus("Parse the template first");
      return;
    }

    const missingSheet = !sheet;
    const missingZip = !zip;
    if (missingSheet || missingZip) {
      setShowMissing(true);
      const missing: string[] = [];
      if (missingSheet) missing.push("Spreadsheet (.xlsx or .csv)");
      if (missingZip) missing.push("Portraits ZIP (.zip)");
      setStatus(`Missing required file(s): ${missing.join(", ")}`);
      const target = (missingSheet ? sheetRef.current : zipRef.current) as HTMLElement | null;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    onMapped([]);
    setPeople([]);
    setAdjustments({});
    setAdjustmentsResetNonce((n) => n + 1);
    setOriginalPeople(null);
    setSwapMode("off");
    setDragIdx(null);
    setDropTarget(null);
    setSwapsPerformed(false);
    setProgress(0);
    setLoading(true);
    setStatus("Mapping spreadsheet and portraits...");
    onWarnings([]);
    onWarningsOpen(false);
    onCompletedErrorCount(null);

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
      const nextWarnings = resp.warnings ?? [];
      onWarnings(nextWarnings);
      onCompletedErrorCount(nextWarnings.length);

      if (uploadFinishedMs !== null) {
        const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
        if (processingSeconds >= 0.25) {
          ingestProcessingEstimateSecondsRef.current =
            0.7 * ingestProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
        }
      }

      setStatus("Portrait mapping processing completed");
      setProgress(100);
    } catch (err) {
      clearProcessingInterval();
      console.error(err);
      setStatus(`Mapping failed.\n${formatServerMessage(err)}`);
    } finally {
      clearProcessingInterval();
      setLoading(false);
    }
  };

  const resetToOriginalMapping = () => {
    if (!originalPeople) {
      setStatus("No original mapping to reset to");
      return;
    }
    setPeople(originalPeople.map((p) => ({ ...p })));
    setAdjustments({});
    setAdjustmentsResetNonce((n) => n + 1);
    setSwapMode("off");
    setDragIdx(null);
    setDropTarget(null);
    setSwapsPerformed(false);
    setStatus("Reset to original mapping");
  };

  const setShiftEnabled = (personIndex: number, enabled: boolean) => {
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      // If the user enables Shift and no value exists yet, default to 1.
      // Preserve 0 (and negative values) so the input can pass through 0 while editing.
      const nextShiftCount = enabled ? (current.shiftCount ?? 1) : (current.shiftCount ?? 0);
      const next = { ...current, shiftEnabled: enabled, shiftCount: nextShiftCount };
      if (!next.shiftEnabled && !next.replacement_mugshot && !next.remove) {
        const { [personIndex]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personIndex]: next };
    });
  };

  const setShiftCount = (personIndex: number, shiftCount: number) => {
    const normalized = Number.isFinite(shiftCount) ? Math.floor(shiftCount) : 0;
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      const next = { ...current, shiftCount: normalized };
      // Do not auto-disable Shift when the user types 0; keep the row adjustment
      // as long as Shift is enabled so the user can continue editing into negatives.
      if (!next.shiftEnabled && !next.shiftCount && !next.replacement_mugshot && !next.remove) {
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
        [personIndex]: { ...prev[personIndex], remove: false, replacement_mugshot: filename },
      }));
      setStatus("Uploaded replacement portrait");
    } catch (err) {
      console.error(err);
      setStatus(`Upload failed.\n${formatServerMessage(err)}`);
    }
  };

  const toggleLock = (personIndex: number) => {
    onLockedPeople((prev) => {
      const next = { ...prev };
      if (next[personIndex]) {
        delete next[personIndex];
      } else {
        next[personIndex] = true;
      }
      return next;
    });
  };

  const removePerson = (personIndex: number) => {
    setPeople((prev) => prev.filter((p) => p.index !== personIndex));
    setAdjustments((prev) => {
      const { [personIndex]: _omit, ...rest } = prev;
      return rest;
    });
    onLockedPeople((prev) => {
      const next = { ...prev };
      delete next[personIndex];
      return next;
    });
    setSwapsPerformed(true);
  };

  const reorderDefaultMugshots = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    onDefaultMugshotFilenames((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const removeDefaultMugshot = (filename: string) => {
    onDefaultMugshotFilenames((prev) => prev.filter((f) => f !== filename));
  };

  const uploadDefaultMugshots = async (files: File[] | null) => {
    if (!workspaceId || !files || files.length === 0) return;
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const filename = await uploadImage(workspaceId, "mugshot", file);
        uploaded.push(filename);
      }
      if (uploaded.length) {
        onDefaultMugshotFilenames((prev) => {
          const next = [...prev];
          for (const f of uploaded) {
            if (!next.includes(f)) next.push(f);
          }
          return next;
        });
      }
      setStatus(`Added ${uploaded.length} default portrait${uploaded.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      setStatus(`Default portrait upload failed.\n${formatServerMessage(err)}`);
    }
  };

  const applyDecisions = async () => {
    if (!workspaceId) return;
    const lockedSnapshot = Object.keys(lockedPeople).reduce((acc, key) => {
      const idx = Number(key);
      if (!Number.isFinite(idx)) return acc;
      const person = people.find((p) => p.index === idx);
      acc[idx] = person?.mugshot_filename ?? null;
      return acc;
    }, {} as Record<number, string | null>);
    const entries = Object.entries(adjustments)
      .map(([personIndex, entry]) => ({ personIndex: Number(personIndex), entry }))
      .filter(({ personIndex }) => Number.isFinite(personIndex));

    const shiftPayload: { person_index: number; action: "shift" | "shift_up" }[] = [];
    const removePayload: { person_index: number; action: "remove" }[] = [];
    const replacePayload: { person_index: number; action: "replace"; replacement_mugshot: string }[] = [];

    entries
      .sort((a, b) => a.personIndex - b.personIndex)
      .forEach(({ personIndex, entry }) => {
        if (!entry.shiftEnabled) return;
        const shiftCount = Math.floor(entry.shiftCount ?? 0);
        if (shiftCount > 0) {
          for (let i = 0; i < shiftCount; i++) {
            shiftPayload.push({ person_index: personIndex, action: "shift" });
          }
        } else if (shiftCount < 0) {
          for (let i = 0; i < Math.abs(shiftCount); i++) {
            shiftPayload.push({ person_index: personIndex, action: "shift_up" });
          }
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
            replacement_mugshot: entry.replacement_mugshot,
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
      let nextPeople = resp.people;
      if (Object.keys(lockedPeople).length > 0) {
        nextPeople = resp.people.map((p) => {
          if (!lockedPeople[p.index]) return p;
          const adjustment = adjustments[p.index];
          if (adjustment?.remove || adjustment?.replacement_mugshot) return p;
          if (Object.prototype.hasOwnProperty.call(lockedSnapshot, p.index)) {
            return { ...p, mugshot_filename: lockedSnapshot[p.index] };
          }
          return p;
        });
      }
      setPeople(nextPeople);
      setStatus("Mapping updated");
      setAdjustments({});
      setAdjustmentsResetNonce((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus(`Mapping update failed.\n${formatServerMessage(err)}`);
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

  const swapPortraits = (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx) return;
    if (sourceIdx < 0 || targetIdx < 0) return;
    if (sourceIdx >= people.length || targetIdx >= people.length) return;
    const sourcePerson = people[sourceIdx];
    const targetPerson = people[targetIdx];
    if (!sourcePerson || !targetPerson) return;
    if (lockedPeople[sourcePerson.index] || lockedPeople[targetPerson.index]) return;
    const next = [...people];
    const a = next[sourceIdx];
    const b = next[targetIdx];
    next[sourceIdx] = { ...a, mugshot_filename: b.mugshot_filename };
    next[targetIdx] = { ...b, mugshot_filename: a.mugshot_filename };
    setPeople(next);
  };

  const handleSwapDrop = (targetIdx: number, evt: React.DragEvent<HTMLDivElement>) => {
    if (!swapEnabled) return;
    evt.preventDefault();
    const payload = evt.dataTransfer.getData("text/plain");
    const sourceIdx = dragIdx ?? Number(payload);
    if (Number.isNaN(sourceIdx) || sourceIdx == null || sourceIdx === targetIdx) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    if (swapMode === "card") swapPositions(sourceIdx, targetIdx);
    if (swapMode === "portrait") swapPortraits(sourceIdx, targetIdx);
    setSwapsPerformed(true);
    setDropTarget(null);
    setDragIdx(null);
  };

  const hasPeople = people.length > 0;

  return (
    <div className={clsx("mapping-layout", !hasPeople && "mapping-layout-empty")}>
      <ImagePreviewDialog
        open={previewOpen}
        title={previewTitle}
        imageUrl={previewUrl}
        rotationDegrees={previewRotation}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewRotation(0);
        }}
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewRotation(0);
        }}
        cancelLabel="Cancel"
        onRotateClockwise={() => setPreviewRotation((r) => (r + 90) % 360)}
        onRotateCounterClockwise={() => setPreviewRotation((r) => (r - 90 + 360) % 360)}
      />
      <div className="mapping-main">
        <div className="panel">
          {workspaceId && people.length > 0 ? (
            <div className="stack">
              <div className={clsx("people-grid", animatePeopleIn && "people-grid-enter")}>
                {people.map((p, rowIdx) => {
                  const isLocked = Boolean(lockedPeople[p.index]);
                  const assignedDefault = defaultMugshotAssignments[p.index];
                  const mugshotFilename = p.mugshot_filename || assignedDefault || null;
                  const assignedDefaultQuote = defaultQuoteAssignments[p.index] ?? "";
                  const displayQuote = (p.quote ?? "").trim() ? (p.quote ?? "") : assignedDefaultQuote || defaultQuoteFallback;
                  const babyFilename = p.baby_photo_filename || defaultBabyFilename;
                  const cardClasses = clsx("people-card", {
                    "swap-mode": swapMode === "card",
                    dragging: swapMode === "card" && dragIdx === rowIdx,
                    "swap-target": swapMode === "card" && dropTarget === rowIdx,
                    "people-card-locked": isLocked,
                  });
                  return (
                    <PeopleCard
                      key={p.index}
                      person={p}
                      workspaceId={workspaceId}
                      className={cardClasses}
                      draggable={swapMode === "card" && !isLocked}
                      onDragStart={(evt) => {
                        if (swapMode !== "card" || isLocked) return;
                        setDragIdx(rowIdx);
                        evt.dataTransfer.effectAllowed = "move";
                        evt.dataTransfer.setData("text/plain", String(rowIdx));
                      }}
                      onDragOver={(evt) => {
                        if (!swapEnabled || isLocked) return;
                        evt.preventDefault();
                        if (dropTarget !== rowIdx) setDropTarget(rowIdx);
                      }}
                      onDragLeave={() => {
                        if (!swapEnabled || isLocked) return;
                        if (dropTarget === rowIdx) setDropTarget(null);
                      }}
                      onDrop={(evt) => {
                        if (isLocked) return;
                        handleSwapDrop(rowIdx, evt);
                      }}
                      mugshot={{
                        label: "Portrait",
                        kind: "mugshot",
                        filename: p.mugshot_filename,
                        defaultFilename: assignedDefault ?? null,
                        showDefaultLabel: true,
                        overlayLabel: swapMode === "portrait" && swapEnabled ? "Drag to swap" : null,
                        onClick: () => {
                          if (!workspaceId || !mugshotFilename) return;
                          setPreviewTitle(`${p.first_name} ${p.last_name}`.trim() || "Portrait preview");
                          setPreviewUrl(assetUrl(workspaceId, "mugshot", mugshotFilename));
                          setPreviewRotation(0);
                          setPreviewOpen(true);
                        },
                      }}
                      baby={{
                        label: "Baby",
                        kind: "baby",
                        filename: babyFilename,
                        showMissingLabel: false,
                        wrapperClassName: "thumb-cell-baby thumb-cell-baby-editor",
                        className: maskUrl ? "baby-thumb-masked" : undefined,
                        style: maskUrl
                          ? ({
                              ["--baby-mask" as never]: `url(${maskUrl})`,
                              width: babyThumbDims.width,
                              height: babyThumbDims.height,
                              minWidth: babyThumbDims.width,
                              minHeight: babyThumbDims.height,
                            } as React.CSSProperties)
                          : undefined,
                        renderMode: "baby-editor",
                        onClick: () => {
                          if (!babyFilename || isLocked) return;
                          babyEditorRef.current?.openEditor(rowIdx);
                        },
                      }}
                      quoteValue={displayQuote}
                      onQuoteChange={(value) => updatePerson(rowIdx, (prev) => ({ ...prev, quote: value }))}
                      showQuote={false}
                    >
                      <div className="grid two">
                        <ToggleSwitch
                          checked={Boolean(adjustments[p.index]?.shiftEnabled)}
                          onChange={(checked) => setShiftEnabled(p.index, checked)}
                          label="Shift down"
                          disabled={isLocked}
                        />
                        <label className="field">
                          <span>Shift count</span>
                          <input
                            type="number"
                            value={adjustments[p.index]?.shiftCount ?? 0}
                            onChange={(e) => setShiftCount(p.index, Number(e.target.value))}
                            disabled={isLocked || !adjustments[p.index]?.shiftEnabled}
                          />
                        </label>
                      </div>

                      <label className="field">
                        <span>Replacement portrait</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => uploadReplacement(p.index, e.target.files?.[0] ?? null)}
                          disabled={loading || isLocked}
                        />
                      </label>

                      <div className="inline" style={{ gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          className="icon-btn lock-toggle-btn"
                          onClick={() => toggleLock(p.index)}
                          aria-label={isLocked ? "Unlock person" : "Lock person"}
                          title={isLocked ? "Unlock" : "Lock"}
                        >
                          {isLocked ? (
                            <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M7 10V8a5 5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                              <rect x="5" y="10" width="14" height="10" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2.25" />
                              <path d="M12 14v2" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M7 10V7a5 5 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                              <rect x="5" y="10" width="14" height="10" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2.25" />
                              <path d="M12 14v2" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                        <InfoPopover
                          content="Locking a person protects their portrait/row from edits and swaps, but they will still be included in the final result."
                          ariaLabel="Lock person description"
                          position="below"
                          className="lock-info-popover"
                        />
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setConfirmAction({ kind: "remove-person", personIndex: p.index })}
                          aria-label="Remove person"
                          title="Remove person"
                          disabled={isLocked}
                        >
                          <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setConfirmAction({ kind: "remove-portrait", personIndex: p.index })}
                          aria-label="Remove portrait"
                          title="Remove portrait"
                          disabled={isLocked}
                        >
                          <span className="icon-stack" aria-hidden="true">
                            <svg className="icon-svg" viewBox="0 0 24 24">
                              <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                              <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <svg className="icon-corner" viewBox="0 0 24 24">
                              <rect x="4" y="6" width="16" height="12" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
                              <path d="M8 14l3-3 2 2 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </PeopleCard>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="muted">No people loaded yet. Ingest the spreadsheet and portraits first.</p>
          )}
        </div>
      </div>

      <aside className={clsx("mapping-sidebar", animateSidebarCollapse && "mapping-sidebar-collapse")}>
        <div className="panel">
          <div className="stack">
            <div className="mapping-sidebar-header">
              <h3 className="mapping-sidebar-title">Portraits</h3>
              <InfoPopover
                content={
                  "Upload a spreadsheet (.xlsx or .csv) and a portraits ZIP. By default, this step matches portraits by digits first (example: 001.jpg → row 1) using the filename pattern, with rows starting at 1 (header row is ignored). With Prioritize names (enabled by default), the app will first assign any files whose filenames contain a student's first + last name, then fill the remaining rows by digits (numbered files may shift down if a name match took that row). Non-matching files are skipped and listed in warnings."
                }
                ariaLabel="Portraits step description"
                position="below"
              />
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="stack sidebar-actions-full">
                <button
                  className="primary"
                  onClick={() => setConfirmAction({ kind: "apply-mapping" })}
                  disabled={loading || !people.length}
                >
                  Apply mapping adjustments
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setConfirmAction({ kind: "reset-mapping" })}
                  disabled={loading || !originalPeople || !(swapsPerformed || Object.keys(adjustments).length > 0)}
                >
                  Reset to original mapping
                </button>
              </div>

              <div className="sidebar-swap-row">
                <button
                  type="button"
                  className={clsx({ primary: swapMode === "card" })}
                  onClick={() => setSwapMode((v) => (v === "card" ? "off" : "card"))}
                >
                  {swapMode === "card" ? "Swap Cards: On" : "Swap Cards: Off"}
                </button>
                <button
                  type="button"
                  className={clsx({ primary: swapMode === "portrait" })}
                  onClick={() => setSwapMode((v) => (v === "portrait" ? "off" : "portrait"))}
                >
                  {swapMode === "portrait" ? "Swap Portraits: On" : "Swap Portraits: Off"}
                </button>
              </div>

              {swapMode === "card" && <p className="muted small">Card swap: drag a card onto another to swap their ordering.</p>}
              {swapMode === "portrait" && (
                <p className="muted small">Portrait swap: drag a card onto another to swap which portrait is mapped to each card.</p>
              )}
            </div>

            <div ref={sheetRef}>
              <div className="upload-title">Spreadsheet</div>
              {showMissing && !sheet ? (
                <div className="upload-error">
                  <span aria-hidden="true">❗</span> Please upload a file
                </div>
              ) : null}
              <UploadDropLabel
                accept=".xlsx,.csv"
                disabled={loading}
                className={showMissing && !sheet ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setSheet(file);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setShowMissing(false);
                    setSheet(e.target.files?.[0] ?? null);
                  }}
                />
              </UploadDropLabel>
            </div>

            <div ref={zipRef}>
              <div className="upload-title">Portraits ZIP</div>
              {showMissing && !zip ? (
                <div className="upload-error">
                  <span aria-hidden="true">❗</span> Please upload a file
                </div>
              ) : null}
              <UploadDropLabel
                accept=".zip"
                disabled={loading}
                className={showMissing && !zip ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setZip(file);
                }}
              >
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    setShowMissing(false);
                    setZip(e.target.files?.[0] ?? null);
                  }}
                />
              </UploadDropLabel>
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
                  <InfoPopover
                    content="Default matches 3–4 digit stems (e.g., 001.jpg). Use ^ and $ for exact matches; non-matching files are skipped."
                    ariaLabel="Filename pattern description"
                  />
                </span>
                <input
                  type="text"
                  value={namingPattern}
                  onChange={(e) => setNamingPattern(e.target.value)}
                  placeholder={defaultNamingPattern}
                />
              </label>
            )}

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Prioritize names (case-insensitive)"
              description="When on, filenames containing FIRST+LAST (or LAST+FIRST) map to that student first, then numbered portraits fill the remaining rows (numbered files may shift down)."
            />

            <div className="stack" style={{ gap: 6 }}>
              <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                <strong>Default portraits (optional)</strong>
                <InfoPopover content="Used when a student has no portrait. Reorder to create a pattern." ariaLabel="Default portraits description" />
              </div>
              {workspaceId && defaultMugshotFilenames.length > 0 ? (
                <div className="default-portrait-grid">
                  {defaultMugshotFilenames.map((filename, idx) => (
                    <div
                      key={`${filename}-${idx}`}
                      className={clsx("default-portrait-item", defaultDragIdx === idx && "dragging")}
                      draggable
                      onDragStart={() => setDefaultDragIdx(idx)}
                      onDragOver={(evt) => evt.preventDefault()}
                      onDragEnd={() => setDefaultDragIdx(null)}
                      onDrop={() => {
                        if (defaultDragIdx == null) return;
                        reorderDefaultMugshots(defaultDragIdx, idx);
                        setDefaultDragIdx(null);
                      }}
                    >
                      <img src={assetUrl(workspaceId, "mugshot", filename)} alt="default portrait" className="thumb" />
                      <div className="default-portrait-actions">
                        <button type="button" onClick={() => removeDefaultMugshot(filename)} disabled={loading}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline" style={{ alignItems: "center", gap: 10 }}>
                  <img src={withBase("assets/default_eagle.svg")} alt="default portrait (eagle)" className="thumb" />
                  <span className="muted small">Current default: eagle (auto fallback)</span>
                </div>
              )}

              <UploadDropLabel accept="image/*" disabled={loading} multiple onFiles={uploadDefaultMugshots}>
                <span className="muted small">Upload default portrait(s)</span>
                <input type="file" accept="image/*" multiple />
              </UploadDropLabel>

              <ToggleSwitch
                checked={defaultMugshotRandomize}
                onChange={onDefaultMugshotRandomize}
                label="Randomize default portraits"
                description="When on, missing portraits use a random default from the list."
              />

              <div className="inline" style={{ gap: 10 }}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      const filename = await ensureDefaultMugshotEagle();
                      if (filename) {
                        onDefaultMugshotFilenames((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
                        setStatus("Eagle portrait added to defaults");
                      }
                    } catch (err) {
                      console.error(err);
                      setStatus("Could not add eagle portrait");
                    }
                  }}
                >
                  Add eagle default
                </button>
                <button type="button" disabled={loading} onClick={() => onDefaultMugshotFilenames([])}>
                  Clear defaults
                </button>
              </div>
            </div>

            <button className="primary" onClick={handleIngest} disabled={loading}>
              {loading ? "Ingesting..." : "Ingest spreadsheet"}
            </button>
            {warnings.length > 0 && (
              <details
                ref={warningsRef}
                className="muted small"
                open={warningsOpen}
                onToggle={(e) => onWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
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
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmAction({ kind: "reset-all" })}
                disabled={loading}
              >
                Reset all
              </button>
              <button className="primary" onClick={onContinue} disabled={!canContinue || loading}>
                Continue
              </button>
            </div>
            <div ref={statusRef} className="stack" style={{ gap: 6 }}>
              <CompletionServerMessageWithWarningsLink
                completedErrorCount={completedErrorCount}
                baseMessage="Portrait mapping processing completed"
                detailsRef={warningsRef}
                setDetailsOpen={onWarningsOpen}
              />
              {completedErrorCount === null && status ? (
                <p className="muted prewrap">{prefixServerMessage(status)}</p>
              ) : null}
              {loading && progress > 0 && <ProgressBar progress={progress} />}
            </div>
            <div className="tool-tips-center">
              <TipsBox tips={sidebarTips} />
            </div>
          </div>
        </div>
      </aside>

      <BabyPhotoEditor
        ref={babyEditorRef}
        workspaceId={workspaceId}
        people={people}
        setPeople={setPeople}
        defaultBabyFilename={defaultBabyFilename}
        babyMaskBox={babyMaskBox}
        babyBackgroundColor={babyBackgroundColor}
        babyBackgroundMode={babyBackgroundMode}
        allowInsecureUploads={allowInsecureUploads}
        setStatus={setStatus}
        onBabyEditHistoryAdd={onBabyEditHistoryAdd}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.kind === "remove-person"
            ? "Remove person?"
            : confirmAction?.kind === "remove-portrait"
              ? "Remove portrait?"
            : confirmAction?.kind === "apply-mapping"
              ? "Apply mapping changes?"
              : confirmAction?.kind === "reset-mapping"
                ? "Reset mapping?"
                : "Reset everything?"
        }
        message={
          confirmAction?.kind === "remove-person"
            ? "This will remove the person from the mapping list."
            : confirmAction?.kind === "remove-portrait"
              ? "This will clear the portrait for this person."
            : confirmAction?.kind === "apply-mapping"
              ? "Apply the current shift/replace/remove adjustments to the mapping?"
              : confirmAction?.kind === "reset-mapping"
                ? "This will revert mapping changes back to the original ingest result."
                : "This will clear the workspace and all current progress."
        }
        confirmLabel={
          confirmAction?.kind === "remove-person"
            ? "Remove"
            : confirmAction?.kind === "remove-portrait"
              ? "Remove"
            : confirmAction?.kind === "apply-mapping"
              ? "Apply"
              : "Reset"
        }
        cancelLabel="Cancel"
        destructive={
          confirmAction?.kind === "remove-person" ||
          confirmAction?.kind === "remove-portrait" ||
          confirmAction?.kind === "reset-mapping" ||
          confirmAction?.kind === "reset-all"
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "remove-person") {
            removePerson(confirmAction.personIndex);
          } else if (confirmAction.kind === "remove-portrait") {
            setRemoveEnabled(confirmAction.personIndex, true);
          } else if (confirmAction.kind === "apply-mapping") {
            void applyDecisions();
          } else if (confirmAction.kind === "reset-mapping") {
            resetToOriginalMapping();
          } else if (confirmAction.kind === "reset-all") {
            onReset();
          }
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
