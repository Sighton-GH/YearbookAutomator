import type React from "react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { applyMapping, assetUrl, ingestSpreadsheet, uploadImage, type PersonRecord } from "../api";
import { withBase } from "../baseUrl";
import { ProgressBar } from "../components/ProgressBar";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { formatServerMessage } from "../configFile";
import { formatEtaSeconds, scrollPastTopBar } from "../utils/ui";

export function MugshotMapping({
  workspaceId,
  defaultMugshotFilename,
  onDefaultMugshotFilename,
  ensureDefaultMugshotEagle,
  namingPattern,
  setNamingPattern,
  advancedNameMatch,
  setAdvancedNameMatch,
  allowInsecureUploads,
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
  namingPattern: string;
  setNamingPattern: (v: string) => void;
  advancedNameMatch: boolean;
  setAdvancedNameMatch: (v: boolean) => void;
  allowInsecureUploads: boolean;
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
  const [showMissing, setShowMissing] = useState(false);
  const defaultNamingPattern = "\\d{3,4}";
  const [showAdvancedNaming, setShowAdvancedNaming] = useState(false);
  const [adjustments, setAdjustments] = useState<
    Record<number, { shiftCount?: number; replacement_mugshot?: string; remove?: boolean }>
  >({});
  const [adjustmentsResetNonce, setAdjustmentsResetNonce] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [originalPeople, setOriginalPeople] = useState<PersonRecord[] | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const ingestProcessingEstimateSecondsRef = useRef<number>(10);
  const didScrollForProgressRef = useRef(false);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const zipRef = useRef<HTMLDivElement | null>(null);

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
        [personIndex]: { ...prev[personIndex], remove: false, replacement_mugshot: filename },
      }));
      setStatus("Uploaded replacement portrait");
    } catch (err) {
      console.error(err);
      setStatus(`Upload failed.\n${formatServerMessage(err)}`);
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
      setStatus(`Default portrait upload failed.\n${formatServerMessage(err)}`);
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
      setPeople(resp.people);
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
            <p className="muted">
              Upload a spreadsheet (.xlsx or .csv) and a portraits ZIP. By default, this step matches portraits by
              digits first (example: 001.jpg → row 1) using the filename pattern, with rows starting at 1 (header row is
              ignored). With <strong>Prioritize names</strong> (enabled by default), the app will first assign any files
              whose filenames contain a student's first + last name, then fill the remaining rows by digits (numbered
              files may shift down if a name match took that row). Non-matching files are skipped and listed in warnings.
            </p>
            <div ref={sheetRef}>
              <UploadDropLabel
                accept=".xlsx,.csv"
                disabled={loading}
                className={showMissing && !sheet ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setSheet(file);
                }}
              >
                <span>
                  {showMissing && !sheet ? <span className="warn-icon" aria-hidden="true">⚠</span> : null}
                  Spreadsheet
                </span>
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
              <UploadDropLabel
                accept=".zip"
                disabled={loading}
                className={showMissing && !zip ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setZip(file);
                }}
              >
                <span>
                  {showMissing && !zip ? <span className="warn-icon" aria-hidden="true">⚠</span> : null}
                  Portraits ZIP
                </span>
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
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      const filename = await ensureDefaultMugshotEagle();
                      if (filename) {
                        setStatus("Default portrait set to eagle");
                      }
                    } catch (err) {
                      console.error(err);
                      setStatus("Could not set default eagle portrait");
                    }
                  }}
                >
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
            {status && <p className="muted prewrap">{status}</p>}
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
                          <img src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)} alt="portrait" className="thumb" />
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
                      <input type="file" accept="image/*" onChange={(e) => uploadReplacement(p.index, e.target.files?.[0] ?? null)} />
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
