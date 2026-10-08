import { editPersonName } from "../../utils/personEdits";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Users } from "lucide-react";
import { ProgressBar } from "../../components/ProgressBar";
import {
  applyMapping,
  assetUrl,
  babyMaskUrl,
  uploadImage,
  type BackgroundMode,
  type Box,
  type PersonRecord,
} from "../../api";
import { withBase } from "../../baseUrl";
import { BabyPhotoEditor, type BabyPhotoEditorHandle } from "../../components/BabyPhotoEditor";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PeopleCard } from "../../components/PeopleCard";
import { ImagePreviewDialog } from "../../components/ImagePreviewDialog";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { InfoPopover } from "../../components/InfoPopover";
import { UploadDropLabel } from "../../components/UploadDropLabel";
import { Inspector } from "../../components/Inspector";
import { PersonInspector, type PersonAdjustment } from "../../components/PersonInspector";
import { formatServerMessage } from "../../configFile";
import type { PersistedSessionV1 } from "../../session";



export function PeopleTab({
  workspaceId,
  skipQuotes,
  skipBabyPhotos,
  people,
  setPeople,
  pendingPeopleAdjustments,
  peopleSwapMode,
  onPeopleSwapMode,
  onPendingPeopleAdjustments,
  originalPeople,
  setOriginalPeople,
  originalBabyPeople,
  lockedPeople,
  onLockedPeople,
  defaultMugshotFilenames,
  onDefaultMugshotFilenames,
  defaultMugshotRandomize,
  onDefaultMugshotRandomize,
  defaultMugshotAssignments,
  ensureDefaultMugshotEagle,
  defaultQuotes,
  onDefaultQuotes,
  defaultQuotesRandomize,
  onDefaultQuotesRandomize,
  defaultQuoteAssignments,
  defaultQuoteFallback,
  defaultBabyFilename,
  babyBackgroundColor,
  babyBackgroundMode,
  onBabyEditHistoryAdd,
  babyEditorProtectedFilenames,
  babyMaskBox,
  babyBoxByPerson,
  allowInsecureUploads,
  setStatus,
  loading,
}: {
  workspaceId: string | null;
  skipQuotes: boolean;
  skipBabyPhotos: boolean;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  peopleSwapMode: "off" | "card" | "portrait";
  onPeopleSwapMode: React.Dispatch<React.SetStateAction<"off" | "card" | "portrait">>;
  pendingPeopleAdjustments: Record<number, import("../../components/PersonInspector").PersonAdjustment>;
  onPendingPeopleAdjustments: React.Dispatch<React.SetStateAction<Record<number, import("../../components/PersonInspector").PersonAdjustment>>>;
  originalPeople: PersonRecord[] | null;
  setOriginalPeople: (p: PersonRecord[] | null) => void;
  originalBabyPeople: PersonRecord[] | null;
  lockedPeople: Record<number, true>;
  onLockedPeople: React.Dispatch<React.SetStateAction<Record<number, true>>>;
  defaultMugshotFilenames: string[];
  onDefaultMugshotFilenames: React.Dispatch<React.SetStateAction<string[]>>;
  defaultMugshotRandomize: boolean;
  onDefaultMugshotRandomize: (v: boolean) => void;
  defaultMugshotAssignments: Record<number, string>;
  ensureDefaultMugshotEagle: () => Promise<string | null>;
  defaultQuotes: string[];
  onDefaultQuotes: React.Dispatch<React.SetStateAction<string[]>>;
  defaultQuotesRandomize: boolean;
  onDefaultQuotesRandomize: (v: boolean) => void;
  defaultQuoteAssignments: Record<number, string>;
  defaultQuoteFallback: string;
  defaultBabyFilename: string | null;
  babyBackgroundColor: string;
  babyBackgroundMode: BackgroundMode;
  babyEditorProtectedFilenames: string[];
  onBabyEditHistoryAdd: (entry: NonNullable<PersistedSessionV1["babyEditHistory"]>[number]) => void;
  babyMaskBox: Box | null;
  babyBoxByPerson?: Record<number, Box | null>;
  allowInsecureUploads: boolean;
  setStatus: (v: string) => void;
  loading: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const swapMode = peopleSwapMode;
  const setSwapMode = onPeopleSwapMode;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [swapsPerformed, setSwapsPerformed] = useState(false);
  const adjustments = pendingPeopleAdjustments;
  const setAdjustments = onPendingPeopleAdjustments;
  const [defaultDragIdx, setDefaultDragIdx] = useState<number | null>(null);
  const [newQuoteDraft, setNewQuoteDraft] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "remove-person"; personIndex: number }
    | { kind: "remove-portrait"; personIndex: number }
    | { kind: "reset-mapping" }
    | { kind: "apply-mapping" }
    | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Portrait preview");
  const [previewRotation, setPreviewRotation] = useState(0);

  const babyEditorRef = useRef<BabyPhotoEditorHandle>(null);
  const swapEnabled = swapMode !== "off";

  useEffect(() => {
    setDragIdx(null);
    setDropTarget(null);
  }, [swapMode]);

  // ---- Image load progress: show a bar while the grid's portrait/baby thumbnails load ----
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const loadedKeysRef = useRef<Set<string>>(new Set());
  const totalImages = useMemo(() => {
    if (!workspaceId) return 0;
    let count = 0;
    for (const p of people) {
      if (p.mugshot_filename || defaultMugshotAssignments[p.index]) count += 1;
      if (!skipBabyPhotos && (p.baby_photo_filename || defaultBabyFilename)) count += 1;
    }
    return count;
    // defaultMugshotAssignments / defaultBabyFilename are stable enough; recompute on people changes.
  }, [people, workspaceId, skipBabyPhotos, defaultMugshotAssignments, defaultBabyFilename]);

  // Reset the counter whenever the roster is (re)loaded so the bar reflects a fresh render.
  useEffect(() => {
    loadedKeysRef.current = new Set();
    setImagesLoaded(0);
  }, [workspaceId, people.length]);

  const markImageResolved = (key: string) => {
    if (loadedKeysRef.current.has(key)) return;
    loadedKeysRef.current.add(key);
    setImagesLoaded(loadedKeysRef.current.size);
  };

  const imagesLoading = Boolean(workspaceId) && totalImages > 0 && imagesLoaded < totalImages;
  const imageLoadProgress = totalImages > 0 ? Math.round((imagesLoaded / totalImages) * 100) : 100;

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  // Each student's thumbnail uses the baby slot they are actually placed in; slot 1's shape
  // is the fallback when placement is unknown (old behaviour).
  const babyBoxFor = (personIndex: number | null | undefined): Box | null =>
    (personIndex != null ? babyBoxByPerson?.[personIndex] : undefined) ?? babyMaskBox;
  const babyMaskCssFor = (box: Box | null): string | null =>
    workspaceId && box ? `url(${babyMaskUrl(workspaceId, box)})` : null;
  const babyAspectFor = (box: Box | null): number =>
    box && box.height > 0 ? box.width / box.height : 1;
  const normalizeHexColor = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const hex = withHash.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex.split("").map((c) => c + c).join("").toLowerCase()}`;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
    return null;
  };
  const babyFillColor = normalizeHexColor(babyBackgroundColor);
  // Every baby thumbnail uses the parsed baby slot's aspect ratio + mask so they all render
  // in an identical shape (matching the template slot) instead of each image's natural size.

  // ---- Swap mode ----
  const LOCKED_SWAP_MESSAGE = "That student is locked. Unlock them in the Inspector to move them.";
  const isSwapLocked = (sourceIdx: number, targetIdx: number) => {
    const a = people[sourceIdx];
    const b = people[targetIdx];
    if (!a || !b) return false;
    return Boolean(lockedPeople[a.index] || lockedPeople[b.index]);
  };

  const swapPositions = (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx || sourceIdx < 0 || targetIdx < 0) return;
    if (sourceIdx >= people.length || targetIdx >= people.length) return;
    if (isSwapLocked(sourceIdx, targetIdx)) {
      setStatus(LOCKED_SWAP_MESSAGE);
      return;
    }
    const next = [...people];
    [next[sourceIdx], next[targetIdx]] = [next[targetIdx], next[sourceIdx]];
    setPeople(next);
  };

  const swapPortraits = (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx || sourceIdx < 0 || targetIdx < 0) return;
    if (sourceIdx >= people.length || targetIdx >= people.length) return;
    const a = people[sourceIdx];
    const b = people[targetIdx];
    if (!a || !b) return;
    if (lockedPeople[a.index] || lockedPeople[b.index]) {
      setStatus(LOCKED_SWAP_MESSAGE);
      return;
    }
    const next = [...people];
    next[sourceIdx] = { ...a, mugshot_filename: b.mugshot_filename };
    next[targetIdx] = { ...b, mugshot_filename: a.mugshot_filename };
    setPeople(next);
  };

  const handleSwapDrop = (targetIdx: number, evt: React.DragEvent<HTMLDivElement>) => {
    if (!swapEnabled) return;
    evt.preventDefault();
    const payload = evt.dataTransfer.getData("text/plain");
    const sourceIdx = dragIdx ?? Number(payload);
    if (Number.isNaN(sourceIdx) || sourceIdx === targetIdx) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    if (sourceIdx < 0 || targetIdx < 0 || sourceIdx >= people.length || targetIdx >= people.length) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    if (isSwapLocked(sourceIdx, targetIdx)) {
      setStatus(LOCKED_SWAP_MESSAGE);
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

  // ---- Staged adjustments (shift / replace / remove), applied via "Apply mapping" ----
  const setShiftEnabled = (personIndex: number, enabled: boolean) => {
    setAdjustments((prev) => {
      const current = prev[personIndex] ?? {};
      const nextShiftCount = enabled ? current.shiftCount ?? 1 : current.shiftCount ?? 0;
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
      const next = { ...current, remove: enabled, replacement_mugshot: enabled ? undefined : current.replacement_mugshot };
      if (!next.shiftCount && !next.replacement_mugshot && !next.remove) {
        const { [personIndex]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personIndex]: next };
    });
  };

  const uploadReplacementPortrait = async (personIndex: number, file: File | null) => {
    if (!workspaceId || !file) return;
    try {
      const filename = await uploadImage(workspaceId, "mugshot", file);
      setAdjustments((prev) => ({ ...prev, [personIndex]: { ...prev[personIndex], remove: false, replacement_mugshot: filename } }));
      setStatus("Uploaded replacement portrait");
    } catch (err) {
      console.error(err);
      setStatus(`Upload failed.\n${formatServerMessage(err)}`);
    }
  };

  const toggleLock = (personIndex: number) => {
    onLockedPeople((prev) => {
      const next = { ...prev };
      if (next[personIndex]) delete next[personIndex];
      else next[personIndex] = true;
      return next;
    });
  };

  const removePerson = (personIndex: number) => {
    setPeople(people.filter((p) => p.index !== personIndex));
    setAdjustments((prev) => {
      const { [personIndex]: _omit, ...rest } = prev;
      return rest;
    });
    onLockedPeople((prev) => {
      const next = { ...prev };
      delete next[personIndex];
      return next;
    });
    setSelectedIdx(null);
    setSwapsPerformed(true);
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

    entries.sort((a, b) => a.personIndex - b.personIndex).forEach(({ personIndex, entry }) => {
      if (!entry.shiftEnabled) return;
      const shiftCount = Math.floor(entry.shiftCount ?? 0);
      if (shiftCount > 0) for (let i = 0; i < shiftCount; i++) shiftPayload.push({ person_index: personIndex, action: "shift" });
      else if (shiftCount < 0) for (let i = 0; i < Math.abs(shiftCount); i++) shiftPayload.push({ person_index: personIndex, action: "shift_up" });
    });

    entries.sort((a, b) => a.personIndex - b.personIndex).forEach(({ personIndex, entry }) => {
      if (entry.remove) {
        removePayload.push({ person_index: personIndex, action: "remove" });
        return;
      }
      if (entry.replacement_mugshot) {
        replacePayload.push({ person_index: personIndex, action: "replace", replacement_mugshot: entry.replacement_mugshot });
      }
    });

    const payload = [...shiftPayload, ...removePayload, ...replacePayload];
    if (!payload.length) {
      setStatus("No changes to apply");
      return;
    }
    setStatus("Applying mapping changes...");
    try {
      const resp = await applyMapping(workspaceId, people, payload);
      let nextPeople = resp.people;
      if (Object.keys(lockedPeople).length > 0) {
        nextPeople = resp.people.map((p) => {
          if (!lockedPeople[p.index]) return p;
          const adjustment = adjustments[p.index];
          if (adjustment?.remove || adjustment?.replacement_mugshot) return p;
          if (Object.prototype.hasOwnProperty.call(lockedSnapshot, p.index)) return { ...p, mugshot_filename: lockedSnapshot[p.index] };
          return p;
        });
      }
      setPeople(nextPeople);
      setStatus("Mapping updated");
      setAdjustments({});
    } catch (err) {
      console.error(err);
      setStatus(`Mapping update failed.\n${formatServerMessage(err)}`);
    }
  };

  const resetToOriginalMapping = () => {
    if (!originalPeople) {
      setStatus("No original mapping to reset to");
      return;
    }
    const originalMugshotByIndex = new Map(originalPeople.map((p) => [p.index, p.mugshot_filename ?? null]));
    setPeople(
      people.map((p) =>
        originalMugshotByIndex.has(p.index)
          ? { ...p, mugshot_filename: originalMugshotByIndex.get(p.index) ?? null }
          : p
      )
    );
    setAdjustments({});
    setSwapMode("off");
    setSwapsPerformed(false);
    setStatus("Portraits reset to their original matches (quotes and baby photos kept).");
  };

  // ---- Default portraits management ----
  const reorderDefaultMugshots = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    onDefaultMugshotFilenames((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const removeDefaultMugshot = (filename: string) => onDefaultMugshotFilenames((prev) => prev.filter((f) => f !== filename));

  const uploadDefaultMugshots = async (files: File[] | null) => {
    if (!workspaceId || !files?.length) return;
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        uploaded.push(await uploadImage(workspaceId, "mugshot", file));
      }
      onDefaultMugshotFilenames((prev) => {
        const next = [...prev];
        for (const f of uploaded) if (!next.includes(f)) next.push(f);
        return next;
      });
      setStatus(`Added ${uploaded.length} default portrait${uploaded.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      setStatus(`Default portrait upload failed.\n${formatServerMessage(err)}`);
    }
  };

  // ---- Default quotes management ----
  const addDefaultQuote = () => {
    const trimmed = newQuoteDraft.trim();
    if (!trimmed) return;
    onDefaultQuotes((prev) => [...prev, trimmed]);
    setNewQuoteDraft("");
  };
  const updateDefaultQuoteAt = (idx: number, value: string) =>
    onDefaultQuotes((prev) => prev.map((q, i) => (i === idx ? value : q)));
  const moveDefaultQuote = (from: number, to: number) =>
    onDefaultQuotes((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  const removeDefaultQuote = (idx: number) =>
    onDefaultQuotes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  // ---- Per-person baby photo quick actions ----
  const clearBabyOverride = (idx: number) => {
    const person = people[idx];
    if (!person) return;
    const original = originalBabyPeople?.find((p) => p.index === person.index);
    const nextFilename = original?.baby_photo_filename ?? null;
    if (!nextFilename) {
      setStatus("No original baby photo to reset to");
      return;
    }
    updatePerson(idx, (p) => ({ ...p, baby_photo_filename: nextFilename, baby_background_removal_failed: original?.baby_background_removal_failed ?? false }));
    setStatus(`Reset baby photo for ${person.first_name}`);
  };

  const clearBabyFromPerson = (idx: number) => {
    const person = people[idx];
    if (!person) return;
    updatePerson(idx, (p) => ({ ...p, baby_photo_filename: null, baby_background_removal_failed: false }));
    setStatus(`Removed baby photo for ${person.first_name}`);
  };

  const handlePerPersonBaby = async (idx: number, file: File | null) => {
    if (!workspaceId || !file) return;
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    try {
      const filename = await uploadImage(workspaceId, "baby", file, { removeBackground: false, backgroundMode: babyBackgroundMode });
      updatePerson(idx, (p) => ({ ...p, baby_photo_filename: filename, baby_background_removal_failed: false }));
      setStatus(`Uploaded baby photo for ${people[idx].first_name}`);
    } catch (err) {
      console.error(err);
      setStatus(`Upload failed.\n${formatServerMessage(err)}`);
    }
  };

  const selected = selectedIdx != null ? people[selectedIdx] : null;

  return (
    <div className="layout-with-inspector">
      <div className="stack" style={{ gap: 16 }}>
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
          cancelLabel="Close"
          onRotateClockwise={() => setPreviewRotation((r) => (r + 90) % 360)}
          onRotateCounterClockwise={() => setPreviewRotation((r) => (r - 90 + 360) % 360)}
        />

        <BabyPhotoEditor
          ref={babyEditorRef}
          workspaceId={workspaceId}
          people={people}
          setPeople={setPeople}
          defaultBabyFilename={defaultBabyFilename}
          babyMaskBox={babyMaskBox}
          babyBoxByPerson={babyBoxByPerson}
          babyBackgroundColor={babyBackgroundColor}
          babyBackgroundMode={babyBackgroundMode}
          allowInsecureUploads={allowInsecureUploads}
          setStatus={setStatus}
          originalBabyPeople={originalBabyPeople}
          onBabyEditHistoryAdd={onBabyEditHistoryAdd}
          babyEditorProtectedFilenames={babyEditorProtectedFilenames}
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
                  : "Reset portraits to how they were first matched"
          }
          message={
            confirmAction?.kind === "remove-person"
              ? "This will remove the person from the list."
              : confirmAction?.kind === "remove-portrait"
                ? "This will clear the portrait for this person."
                : confirmAction?.kind === "apply-mapping"
                  ? "Apply the current shift/replace/remove adjustments to the mapping?"
                  : "This will reset portraits to how they were first matched. Quotes and baby photos will be kept."
          }
          confirmLabel={confirmAction?.kind === "apply-mapping" ? "Apply" : confirmAction?.kind === "reset-mapping" ? "Reset" : "Remove"}
          cancelLabel="Cancel"
          destructive={confirmAction?.kind !== "apply-mapping"}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (!confirmAction) return;
            if (confirmAction.kind === "remove-person") removePerson(confirmAction.personIndex);
            else if (confirmAction.kind === "remove-portrait") setRemoveEnabled(confirmAction.personIndex, true);
            else if (confirmAction.kind === "apply-mapping") void applyDecisions();
            else if (confirmAction.kind === "reset-mapping") resetToOriginalMapping();
            setConfirmAction(null);
          }}
        />

        {/* Toolbar */}
        <div className="panel people-toolbar">
          <div className="people-toolbar-row">
            <button className="primary" onClick={() => setConfirmAction({ kind: "apply-mapping" })} disabled={loading || !people.length}>
              Apply mapping adjustments
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => setConfirmAction({ kind: "reset-mapping" })}
              disabled={loading || !originalPeople || !(swapsPerformed || Object.keys(adjustments).length > 0)}
            >
              Reset portraits to how they were first matched
            </button>
            <div className="inline" style={{ gap: 8, marginLeft: "auto" }}>
              <button type="button" className={clsx({ primary: swapMode === "card" })} onClick={() => setSwapMode((v) => (v === "card" ? "off" : "card"))}>
                {swapMode === "card" ? "Swap Cards: On" : "Swap Cards: Off"}
              </button>
              <button type="button" className={clsx({ primary: swapMode === "portrait" })} onClick={() => setSwapMode((v) => (v === "portrait" ? "off" : "portrait"))}>
                {swapMode === "portrait" ? "Swap Portraits: On" : "Swap Portraits: Off"}
              </button>
            </div>
          </div>
          {swapMode === "card" && <p className="muted small">Card swap: drag a card onto another to swap their ordering.</p>}
          {swapMode === "portrait" && <p className="muted small">Portrait swap: drag a card onto another to swap which portrait is mapped to each card.</p>}

          <details className="people-toolbar-defaults">
            <summary>Default portraits &amp; quotes</summary>
            <div className="grid two" style={{ marginTop: 10, alignItems: "start" }}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                  <strong>Default portraits</strong>
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
                <ToggleSwitch checked={defaultMugshotRandomize} onChange={onDefaultMugshotRandomize} label="Randomize default portraits" />
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

              {!skipQuotes && (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="inline" style={{ alignItems: "center", gap: 6 }}>
                    <strong>Default quotes ({people.filter(p => !p.quote_blank && !p.quote?.trim()).length} students)</strong>
                    <InfoPopover content="Used when a student has no quote. Reorder to define the pattern." ariaLabel="Default quotes description" />
                  </div>
                  {defaultQuotes.map((q, idx) => (
                    <div className="inline" style={{ gap: 6 }} key={idx}>
                      <textarea rows={1} value={q} onChange={(e) => updateDefaultQuoteAt(idx, e.target.value)} placeholder="Default quote" style={{ flex: 1 }} />
                      <button type="button" onClick={() => moveDefaultQuote(idx, idx - 1)} disabled={idx === 0}>↑</button>
                      <button type="button" onClick={() => moveDefaultQuote(idx, idx + 1)} disabled={idx === defaultQuotes.length - 1}>↓</button>
                      <button type="button" className="danger" onClick={() => removeDefaultQuote(idx)}>×</button>
                    </div>
                  ))}
                  <div className="inline" style={{ gap: 6 }}>
                    <input type="text" value={newQuoteDraft} onChange={(e) => setNewQuoteDraft(e.target.value)} placeholder="New default quote" style={{ flex: 1 }} />
                    <button type="button" onClick={addDefaultQuote}>Add</button>
                  </div>
                  <ToggleSwitch checked={defaultQuotesRandomize} onChange={onDefaultQuotesRandomize} label="Randomize default quotes" />
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Grid */}
        {imagesLoading && (
          <div className="people-loadbar">
            <span className="muted small">Loading photos… {imagesLoaded}/{totalImages}</span>
            <ProgressBar progress={imageLoadProgress} />
          </div>
        )}
        {workspaceId && people.length > 0 ? (
          <div className="people-grid">
            {people.map((p, rowIdx) => {
              const isLocked = Boolean(lockedPeople[p.index]);
              const assignedDefaultMugshot = defaultMugshotAssignments[p.index] ?? null;
              const mugshotFilename = p.mugshot_filename || assignedDefaultMugshot || null;
              const assignedDefaultQuote = defaultQuoteAssignments[p.index] ?? "";
              const displayQuote = (p.quote ?? "").trim() ? p.quote ?? "" : assignedDefaultQuote || defaultQuoteFallback;
              const babyFilename = p.baby_photo_filename || defaultBabyFilename;
              const rowBabyBox = babyBoxFor(p.index);
              const rowMaskCss = babyMaskCssFor(rowBabyBox);
              const rowBabyAspect = babyAspectFor(rowBabyBox);
              const cardClasses = clsx("people-card-selectable", {
                "people-card-selected": selectedIdx === rowIdx,
                "swap-mode": swapMode === "card",
                dragging: swapMode === "card" && dragIdx === rowIdx,
                "swap-target": swapEnabled && dropTarget === rowIdx,
                "people-card-locked": isLocked,
              });
              return (
                <PeopleCard
                  key={p.index}
                  person={p}
                  workspaceId={workspaceId}
                  className={cardClasses}
                  draggable={swapMode !== "off" && !isLocked}
                  onDragStart={(evt) => {
                    if (swapMode === "off" || isLocked) return;
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
                    if (isLocked) {
                      evt.preventDefault();
                      setStatus(LOCKED_SWAP_MESSAGE);
                      setDropTarget(null);
                      setDragIdx(null);
                      return;
                    }
                    handleSwapDrop(rowIdx, evt);
                  }}
                  mugshot={{
                    label: "Portrait",
                    kind: "mugshot",
                    filename: p.mugshot_filename,
                    defaultFilename: assignedDefaultMugshot,
                    showDefaultLabel: true,
                    overlayLabel: swapMode === "portrait" && swapEnabled ? "Drag to swap" : null,
                    onLoad: () => markImageResolved(`${rowIdx}-mugshot`),
                    onError: () => markImageResolved(`${rowIdx}-mugshot`),
                  }}
                  baby={
                    skipBabyPhotos
                      ? undefined
                      : {
                          label: "Baby",
                          kind: "baby",
                          filename: babyFilename,
                          showMissingLabel: false,
                          emptyLabel: "No baby photo",
                          wrapperClassName: "thumb-cell-baby",
                          className: rowMaskCss ? "baby-thumb-masked" : undefined,
                          style: {
                            aspectRatio: String(rowBabyAspect),
                            ...(rowMaskCss ? ({ ["--baby-mask" as never]: rowMaskCss } as React.CSSProperties) : {}),
                          } as React.CSSProperties,
                          onLoad: () => markImageResolved(`${rowIdx}-baby`),
                          onError: () => markImageResolved(`${rowIdx}-baby`),
                        }
                  }
                  quoteValue={displayQuote}
                  onQuoteChange={() => undefined}
                  showQuote={false}
                  onClick={() => setSelectedIdx(rowIdx)}
                >
                  {!skipQuotes && (
                    <p className="muted small people-card-quote-preview">{displayQuote ? displayQuote : "No quote"}</p>
                  )}
                  {mugshotFilename ? null : <p className="upload-error">Missing portrait</p>}
                </PeopleCard>
              );
            })}
          </div>
        ) : (
          <p className="muted">No people loaded yet. Ingest the spreadsheet and portraits in Import first.</p>
        )}
      </div>

      <Inspector
        title={selected ? `${selected.first_name} ${selected.last_name}` : undefined}
        onClose={selected ? () => setSelectedIdx(null) : undefined}
        empty={!selected}
        emptyIcon={<Users size={28} />}
        emptyTitle="No person selected"
        emptyHint="Click a card to edit their portrait, baby photo, and quote."
      >
        {selected && selectedIdx != null && (
          <PersonInspector
            person={selected}
            workspaceId={workspaceId}
            skipQuotes={skipQuotes}
            skipBabyPhotos={skipBabyPhotos}
            isLocked={Boolean(lockedPeople[selected.index])}
            onToggleLock={() => toggleLock(selected.index)}
            assignedDefaultMugshot={defaultMugshotAssignments[selected.index] ?? null}
            assignedDefaultQuote={defaultQuoteAssignments[selected.index] ?? ""}
            defaultQuoteFallback={defaultQuoteFallback}
            babyFilename={selected.baby_photo_filename || defaultBabyFilename}
            babyMaskCssUrl={babyMaskCssFor(babyBoxFor(selected.index))}
            babyFillColor={babyFillColor}
            babyAspect={babyAspectFor(babyBoxFor(selected.index))}
            adjustment={adjustments[selected.index]}
            onShiftEnabled={(enabled) => setShiftEnabled(selected.index, enabled)}
            onShiftCount={(count) => setShiftCount(selected.index, count)}
            onUploadReplacementPortrait={(file) => void uploadReplacementPortrait(selected.index, file)}
            onRequestRemovePortrait={() => setConfirmAction({ kind: "remove-portrait", personIndex: selected.index })}
            onRequestRemovePerson={() => setConfirmAction({ kind: "remove-person", personIndex: selected.index })}
            onNameChange={(field, value) => updatePerson(selectedIdx, prev => editPersonName(prev, field, value))}
            onQuoteChange={(value) => updatePerson(selectedIdx, (prev) => ({ ...prev, quote: value }))}
            onQuoteBlank={(value) => updatePerson(selectedIdx, (prev) => ({ ...prev, quote_blank: value }))}
            onOpenBabyEditor={() => babyEditorRef.current?.openEditor(selectedIdx)}
            onUploadReplacementBaby={(file) => void handlePerPersonBaby(selectedIdx, file)}
            onResetBabyToOriginal={() => clearBabyOverride(selectedIdx)}
            onRemoveBabyFromPerson={() => clearBabyFromPerson(selectedIdx)}
            onPreviewPortrait={() => {
              if (!workspaceId) return;
              const filename = selected.mugshot_filename || defaultMugshotAssignments[selected.index];
              if (!filename) return;
              setPreviewTitle(`${selected.first_name} ${selected.last_name}`.trim() || "Portrait preview");
              setPreviewUrl(assetUrl(workspaceId, "mugshot", filename));
              setPreviewRotation(0);
              setPreviewOpen(true);
            }}
            loading={loading}
          />
        )}
      </Inspector>
    </div>
  );
}
