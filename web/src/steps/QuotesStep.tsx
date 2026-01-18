import type React from "react";
import { useEffect, useRef, useState } from "react";
import { UploadDropLabel } from "../components/UploadDropLabel";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ProgressBar } from "../components/ProgressBar";
import { CompletionServerMessageWithWarningsLink } from "../components/WarningsCompletion";
import { assetUrl, type PersonRecord, uploadQuotesSpreadsheet } from "../api";
import { formatServerMessage } from "../configFile";
import { formatEtaSeconds, prefixServerMessage, scrollPastTopBar } from "../utils/ui";

export function QuotesStep({
  defaultQuotes,
  onDefaultQuotes,
  defaultQuotesRandomize,
  onDefaultQuotesRandomize,
  defaultQuoteAssignments,
  defaultMugshotAssignments,
  defaultBabyFilename,
  quotesWarnings,
  onQuotesWarnings,
  quotesWarningsOpen,
  onQuotesWarningsOpen,
  quotesCompletedErrorCount,
  onQuotesCompletedErrorCount,
  workspaceId,
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
  defaultQuotes: string[];
  onDefaultQuotes: React.Dispatch<React.SetStateAction<string[]>>;
  defaultQuotesRandomize: boolean;
  onDefaultQuotesRandomize: (v: boolean) => void;
  defaultQuoteAssignments: Record<number, string>;
  defaultMugshotAssignments: Record<number, string>;
  defaultBabyFilename: string | null;
  quotesWarnings: string[];
  onQuotesWarnings: (v: string[]) => void;
  quotesWarningsOpen: boolean;
  onQuotesWarningsOpen: (v: boolean) => void;
  quotesCompletedErrorCount: number | null;
  onQuotesCompletedErrorCount: (v: number | null) => void;
  workspaceId: string | null;
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
  const [advancedNameMatch, setAdvancedNameMatch] = useState(true);
  const [quotesSheet, setQuotesSheet] = useState<File | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [newQuoteDraft, setNewQuoteDraft] = useState("");

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const warningsRef = useRef<HTMLDetailsElement | null>(null);

  const quotesProcessingEstimateSecondsRef = useRef<number>(6);
  const didScrollForProgressRef = useRef(false);

  const insecureHttp =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.protocol !== "https:";

  useEffect(() => {
    if (!loading || progress <= 0) {
      didScrollForProgressRef.current = false;
      return;
    }
    if (didScrollForProgressRef.current) return;
    didScrollForProgressRef.current = true;
    scrollPastTopBar();
  }, [loading, progress]);

  const updatePerson = (idx: number, updater: (p: PersonRecord) => PersonRecord) => {
    setPeople(people.map((p, i) => (i === idx ? updater(p) : p)));
  };

  const addDefaultQuote = () => {
    const trimmed = newQuoteDraft.trim();
    if (!trimmed) return;
    onDefaultQuotes((prev) => [...prev, trimmed]);
    setNewQuoteDraft("");
  };

  const updateDefaultQuoteAt = (idx: number, value: string) => {
    onDefaultQuotes((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const moveDefaultQuote = (from: number, to: number) => {
    onDefaultQuotes((prev) => {
      if (from < 0 || from >= prev.length) return prev;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const removeDefaultQuote = (idx: number) => {
    onDefaultQuotes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleProcessQuotes = async () => {
    // Make sure the user can see status/progress updates.
    scrollPastTopBar();
    if (!workspaceId) {
      setStatus("Parse the template and ingest portraits first (workspace is missing)");
      return;
    }
    if (!quotesSheet) {
      setShowMissing(true);
      setStatus("Missing required file: Quotes spreadsheet (.xlsx or .csv)");
      sheetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (insecureHttp && !allowInsecureUploads) {
      setStatus("Uploads over HTTP are not encrypted in transit. Toggle 'I understand' to continue.");
      return;
    }
    try {
      setProgress(0);
      setLoading(true);
      setStatus("Uploading and matching quotes...");
      onQuotesWarnings([]);
      onQuotesWarningsOpen(false);
      onQuotesCompletedErrorCount(null);

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
          const est = Math.max(1, quotesProcessingEstimateSecondsRef.current);
          const remaining = Math.max(0, est - elapsed);
          setProgress((prev) => {
            const pct = 90 + Math.min(9, Math.round((elapsed / est) * 9));
            return Math.max(prev, Math.min(99, pct));
          });
          setStatus(`Processing quotes… ETA ${formatEtaSeconds(remaining)}`);
        }, 250);
      };

      const resp = await uploadQuotesSpreadsheet(workspaceId, people, quotesSheet, {
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
          setStatus(`Uploading quotes… ${clamped}%${etaPart}`);
        },
      });

      clearProcessingInterval();
      setPeople(resp.people);
      const warnings = resp.warnings ?? [];
      onQuotesWarnings(warnings);
      onQuotesCompletedErrorCount(warnings.length);
      setStatus("Quote processing completed");

      if (uploadFinishedMs !== null) {
        const processingSeconds = Math.max(0, (performance.now() - uploadFinishedMs) / 1000);
        if (processingSeconds >= 0.25) {
          quotesProcessingEstimateSecondsRef.current =
            0.7 * quotesProcessingEstimateSecondsRef.current + 0.3 * processingSeconds;
        }
      }

      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus(`Quotes spreadsheet upload failed.\n${formatServerMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mapping-layout">
      <div className="mapping-main">
        <div className="panel">
          {workspaceId && people.length > 0 ? (
            <div className="people-grid">
              {people.map((p, idx) => {
                const assignedDefaultQuote = defaultQuoteAssignments[p.index] ?? "";
                const displayQuote = (p.quote ?? "").trim() ? (p.quote ?? "") : assignedDefaultQuote;
                const assignedDefaultMugshot = defaultMugshotAssignments[p.index];
                const babyFilename = p.baby_photo_filename || defaultBabyFilename;
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
                          {p.mugshot_filename ? (
                            <img
                              src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                              alt="portrait"
                              className="thumb"
                            />
                          ) : assignedDefaultMugshot ? (
                            <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                              <img
                                src={assetUrl(workspaceId, "mugshot", assignedDefaultMugshot)}
                                alt="default portrait"
                                className="thumb"
                              />
                              <div className="muted small">(default)</div>
                            </div>
                          ) : (
                            <div className="muted small">(missing)</div>
                          )}
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

                    <label className="field">
                      <span>Quote</span>
                      <textarea
                        rows={2}
                        value={displayQuote}
                        onChange={(e) => updatePerson(idx, (prev) => ({ ...prev, quote: e.target.value }))}
                        placeholder=""
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No people loaded yet. Complete portrait mapping first.</p>
          )}
        </div>
      </div>

      <aside className="mapping-sidebar">
        <div className="panel">
          <div className="stack">
            <p className="muted">
              Upload a quotes spreadsheet (.xlsx or .csv) and click <strong>Process</strong>. The app matches spreadsheet rows to students by name
              and sets each person's quote (missing quotes are allowed). If a row has a <strong>quote</strong> column, it prefers that; otherwise it
              picks the most quote-like cell and ignores obvious non-quotes like emails/URLs.
            </p>

            <div ref={sheetRef}>
              <div className="upload-title">Quotes spreadsheet (.xlsx or .csv)</div>
              {showMissing && !quotesSheet ? (
                <div className="upload-error">
                  <span aria-hidden="true">❗</span> Please upload a file
                </div>
              ) : null}
              <UploadDropLabel
                disabled={loading}
                className={showMissing && !quotesSheet ? "invalid" : undefined}
                onFile={(file) => {
                  setShowMissing(false);
                  setQuotesSheet(file);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setShowMissing(false);
                    setQuotesSheet(e.target.files?.[0] ?? null);
                  }}
                />
              </UploadDropLabel>
            </div>

            <ToggleSwitch
              checked={advancedNameMatch}
              onChange={setAdvancedNameMatch}
              label="Advanced name matching"
              description="Matches FIRST LAST or LAST FIRST (case-insensitive)."
            />

            <div className="stack" style={{ gap: 8 }}>
              <strong>Default quotes</strong>
              <div className="muted small">Used when a student has no quote. Reorder to define the pattern.</div>

              {defaultQuotes.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  {defaultQuotes.map((q, idx) => (
                    <div key={`default-quote-${idx}`} className="default-quote-row">
                      <textarea
                        rows={2}
                        value={q}
                        onChange={(e) => updateDefaultQuoteAt(idx, e.target.value)}
                        placeholder="Default quote"
                      />
                      <div className="default-quote-actions">
                        <button type="button" onClick={() => moveDefaultQuote(idx, idx - 1)} disabled={idx === 0}>
                          ↑
                        </button>
                        <button type="button" onClick={() => moveDefaultQuote(idx, idx + 1)} disabled={idx === defaultQuotes.length - 1}>
                          ↓
                        </button>
                        <button type="button" className="danger" onClick={() => removeDefaultQuote(idx)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="inline" style={{ gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  value={newQuoteDraft}
                  onChange={(e) => setNewQuoteDraft(e.target.value)}
                  placeholder="Add another default quote"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={addDefaultQuote}>
                  Add
                </button>
              </div>

              <ToggleSwitch
                checked={defaultQuotesRandomize}
                onChange={onDefaultQuotesRandomize}
                label="Randomize default quotes"
                description="When on, missing quotes use a random default from the list."
              />
            </div>

            <button className="primary" type="button" onClick={handleProcessQuotes} disabled={loading}>
              {loading ? "Processing..." : "Process quotes"}
            </button>

            {quotesWarnings.length > 0 && (
              <details
                ref={warningsRef}
                className="muted small"
                open={quotesWarningsOpen}
                onToggle={(e) => onQuotesWarningsOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>
                  <strong>Quotes warnings ({quotesWarnings.length})</strong>
                </summary>
                <ul>
                  {quotesWarnings.map((w) => (
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
              completedErrorCount={quotesCompletedErrorCount}
              baseMessage="Quote processing completed"
              detailsRef={warningsRef}
              setDetailsOpen={onQuotesWarningsOpen}
            />
            {quotesCompletedErrorCount === null && status ? (
              <p className="muted prewrap">{prefixServerMessage(status)}</p>
            ) : null}
            {loading && progress > 0 && <ProgressBar progress={progress} />}
          </div>
        </div>
      </aside>
    </div>
  );
}
