import type React from "react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { applyMapping, assetUrl, ingestSpreadsheet, uploadImage, type PersonRecord } from "../api";
import { withBase } from "../baseUrl";
import { ProgressBar } from "../components/ProgressBar";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { CompletionServerMessageWithWarningsLink } from "../components/WarningsCompletion";
import { formatServerMessage } from "../configFile";
import { formatEtaSeconds, prefixServerMessage, scrollPastTopBar } from "../utils/ui";

export function MugshotMapping({
  workspaceId,
  defaultMugshotFilenames,
  onDefaultMugshotFilenames,
  defaultMugshotRandomize,
  onDefaultMugshotRandomize,
  defaultMugshotAssignments,
  defaultBabyFilename,
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

  const ingestProcessingEstimateSecondsRef = useRef<number>(10);
  const didScrollForProgressRef = useRef(false);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const zipRef = useRef<HTMLDivElement | null>(null);
  const warningsRef = useRef<HTMLDetailsElement | null>(null);

  const didInitDefaultMugshot = useRef(false);

  const swapEnabled = swapMode !== "off";

  useEffect(() => {
    // Avoid leaving stale drag highlights around when switching modes.
    setDragIdx(null);
    setDropTarget(null);
  }, [swapMode]);

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
    scrollPastTopBar();
  }, [loading, progress]);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const handleIngest = async () => {
    // Make sure the user can see status/progress updates.
    scrollPastTopBar();
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

  return (
    <div className="mapping-layout">
      <div className="mapping-main">
        <div className="panel">
          {workspaceId && people.length > 0 ? (
            <div className="stack">
              <div className="people-grid">
                {people.map((p, rowIdx) => {
                  const isLocked = Boolean(lockedPeople[p.index]);
                  const assignedDefault = defaultMugshotAssignments[p.index];
                  const assignedDefaultQuote = defaultQuoteAssignments[p.index] ?? "";
                  const displayQuote = (p.quote ?? "").trim() ? (p.quote ?? "") : assignedDefaultQuote || defaultQuoteFallback;
                  const babyFilename = p.baby_photo_filename || defaultBabyFilename;
                  const cardClasses = clsx("people-card", {
                    "swap-mode": swapMode === "card",
                    dragging: swapMode === "card" && dragIdx === rowIdx,
                    "swap-target": swapMode === "card" && dropTarget === rowIdx,
                  });
                  return (
                    <div
                      className={cardClasses}
                      key={p.index}
                      draggable={swapMode === "card"}
                      onDragStart={(evt) => {
                        if (swapMode !== "card") return;
                        setDragIdx(rowIdx);
                        evt.dataTransfer.effectAllowed = "move";
                        evt.dataTransfer.setData("text/plain", String(rowIdx));
                      }}
                      onDragOver={(evt) => {
                        if (!swapEnabled) return;
                        evt.preventDefault();
                        if (dropTarget !== rowIdx) setDropTarget(rowIdx);
                      }}
                      onDragLeave={() => {
                        if (!swapEnabled) return;
                        if (dropTarget === rowIdx) setDropTarget(null);
                      }}
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

                        <div className="thumb-stack">
                          <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                            <div className="muted small">Mugshot</div>
                            {p.mugshot_filename ? (
                              <img
                                src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                                alt="portrait"
                                className="thumb"
                              />
                            ) : assignedDefault ? (
                              <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                                <img src={assetUrl(workspaceId, "mugshot", assignedDefault)} alt="default portrait" className="thumb" />
                                <div className="muted small">(default)</div>
                              </div>
                            ) : (
                              <div className="muted small">(missing)</div>
                            )}
                            {swapMode === "portrait" ? (
                              <div className="drag-overlay">
                                {swapEnabled ? "Drag to swap" : ""}
                              </div>
                            ) : null}
                          </div>
                          <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                            <div className="muted small">Baby</div>
                            {babyFilename ? (
                              <img
                                src={assetUrl(workspaceId, "baby", babyFilename)}
                                alt="baby"
                                className="thumb thumb-baby"
                              />
                            ) : (
                              <div className="muted small">(missing)</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="stack" style={{ gap: 8 }}>
                        <label className="field">
                          <span>Quote</span>
                          <textarea
                            rows={2}
                            value={displayQuote}
                            onChange={(e) => updatePerson(rowIdx, (prev) => ({ ...prev, quote: e.target.value }))}
                            placeholder=""
                          />
                        </label>

                        <label className="field">
                          <span>Portrait file</span>
                          <div className="inline" style={{ gap: 8, alignItems: "center" }}>
                            <div className="muted small">
                              {p.mugshot_filename || assignedDefault || "(missing)"}
                            </div>
                            {assignedDefault && !p.mugshot_filename && <span className="muted small">default</span>}
                          </div>
                        </label>

                        <div className="grid two">
                          <ToggleSwitch
                            checked={Boolean(adjustments[p.index]?.shiftEnabled)}
                            onChange={(checked) => setShiftEnabled(p.index, checked)}
                            label="Shift down"
                          />
                          <label className="field">
                            <span>Shift count</span>
                            <input
                              type="number"
                              value={adjustments[p.index]?.shiftCount ?? 0}
                              onChange={(e) => setShiftCount(p.index, Number(e.target.value))}
                              disabled={!adjustments[p.index]?.shiftEnabled}
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span>Replacement portrait</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => uploadReplacement(p.index, e.target.files?.[0] ?? null)}
                            disabled={loading}
                          />
                        </label>

                        <ToggleSwitch
                          checked={Boolean(adjustments[p.index]?.remove)}
                          onChange={(checked) => setRemoveEnabled(p.index, checked)}
                          label="Remove portrait"
                        />

                        <div className="inline" style={{ gap: 8, alignItems: "center" }}>
                          <button type="button" onClick={() => toggleLock(p.index)}>
                            {isLocked ? "Unlock" : "Lock"}
                          </button>
                          <button type="button" className="danger" onClick={() => removePerson(p.index)}>
                            Remove person
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="muted">No people loaded yet. Ingest the spreadsheet and portraits first.</p>
          )}
        </div>
      </div>

      <aside className="mapping-sidebar">
        <div className="panel">
          <div className="stack">
            <div className="stack" style={{ gap: 8 }}>
              <div className="inline" style={{ flexWrap: "wrap" }}>
                <button className="primary" onClick={applyDecisions} disabled={loading || !people.length}>
                  Apply mapping adjustments
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={resetToOriginalMapping}
                  disabled={loading || !originalPeople || !(swapsPerformed || Object.keys(adjustments).length > 0)}
                >
                  Reset to original mapping
                </button>
              </div>

              <div className="inline" style={{ flexWrap: "wrap" }}>
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

            <p className="muted">
              Upload a spreadsheet (.xlsx or .csv) and a portraits ZIP. By default, this step matches portraits by
              digits first (example: 001.jpg → row 1) using the filename pattern, with rows starting at 1 (header row is
              ignored). With <strong>Prioritize names</strong> (enabled by default), the app will first assign any files
              whose filenames contain a student's first + last name, then fill the remaining rows by digits (numbered
              files may shift down if a name match took that row). Non-matching files are skipped and listed in warnings.
            </p>
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
              <strong>Default portraits (optional)</strong>
              <div className="muted small">Used when a student has no portrait. Reorder to create a pattern.</div>
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
              <button type="button" className="danger" onClick={onReset} disabled={loading}>
                Reset all
              </button>
              <button className="primary" onClick={onContinue} disabled={!canContinue || loading}>
                Continue
              </button>
            </div>
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
        </div>
      </aside>
    </div>
  );
}
