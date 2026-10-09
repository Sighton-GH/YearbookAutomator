import {useEffect, useRef, useState} from "react";
import {assetUrl, cancelRemoveBackgroundJob, removeBackgroundStatus, startRemoveBackgroundJob, uploadImage, type BackgroundMode, type PersonRecord} from "../api";
import {applyBulkPeople, type BulkAction} from "../utils/bulkPeople";
import {runBulkQueue, type QueueMode, type QueueResult} from "../utils/bulkQueue";
import {faceCentreImage} from "../utils/faceCentreImage";

export function BulkPeopleToolbar({people, selected, onSelection, locked, workspaceId, disabled, onPeople, onBusy, babyAspectFor, backgroundMode}: {
  people: PersonRecord[]; selected: Set<number>; onSelection: (value: Set<number>) => void; locked: Record<number, true>;
  workspaceId: string | null; disabled: boolean; onPeople: (value: PersonRecord[]) => void; onBusy: (value: boolean) => void; babyAspectFor: (personIndex: number) => number; backgroundMode: BackgroundMode;
}) {
  const [action, setAction] = useState<BulkAction>("clear-quotes");
  const [size, setSize] = useState(40);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const signalRef = useRef<{stopped: boolean}>({stopped: false});
  const currentJob = useRef<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  // Latest props, so a long queue never acts on the people/aspect/mode captured at click time.
  const latest = useRef({people, locked, babyAspectFor, backgroundMode, workspaceId});
  latest.current = {people, locked, babyAspectFor, backgroundMode, workspaceId};
  const stopQueue = () => {
    signalRef.current.stopped = true;
    if (currentJob.current) void cancelRemoveBackgroundJob(currentJob.current).catch(() => undefined);
  };
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; stopQueue();};}, []);
  // A different workspace owns different people and photos: never let a running queue cross over.
  useEffect(() => {if (running.current) stopQueue();}, [workspaceId]);
  const available = people.filter(p => selected.has(p.index) && !locked[p.index]);
  const process = async (mode: QueueMode) => {
    if (!workspaceId || busy || disabled || running.current) return;
    running.current = true;
    const signal = {stopped: false}; signalRef.current = signal;
    const ws = workspaceId;
    const items = available.map(p => ({index: p.index, filename: p.baby_photo_filename ?? null}));
    const guard = <T,>(fn: () => T) => {if (mounted.current) fn();};
    setBusy(true); onBusy(true); setProgress(0); setMessage("");
    let result: QueueResult = {completed: 0, skipped: 0, failures: 0, stopped: false, error: null};
    try {
      result = await runBulkQueue({
        mode, items, signal,
        deps: {
          startJob: filename => startRemoveBackgroundJob({workspaceId: ws, kind: "baby", filename, backgroundMode: latest.current.backgroundMode}),
          jobStatus: removeBackgroundStatus, cancelJob: cancelRemoveBackgroundJob,
          fetchPhoto: async filename => {const r = await fetch(assetUrl(ws, "baby", filename)); if (!r.ok) throw new Error("Could not load the baby photo"); return r.blob();},
          centre: faceCentreImage,
          upload: (blob, index) => uploadImage(ws, "baby", new File([blob], `face-centred-${index}-${crypto.randomUUID()}.png`, {type: "image/png"}), {editorOwned: "edit"}),
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => Date.now(),
        },
        aspectFor: index => latest.current.babyAspectFor(index),
        skipNow: (index, filename) => latest.current.workspaceId !== ws || Boolean(latest.current.locked[index]) || !latest.current.people.some(p => p.index === index && p.baby_photo_filename === filename),
        apply: (index, filename, output) => {
          if (signal.stopped || latest.current.workspaceId !== ws) return false;
          // Read-modify-write against the freshest people (not the click-time snapshot), synchronously.
          const current = latest.current.people;
          if (!current.some(p => p.index === index && p.baby_photo_filename === filename)) return false;
          const next = current.map(p => p.index === index ? {...p, baby_photo_filename: output, baby_background_removal_failed: false} : p);
          latest.current = {...latest.current, people: next};
          onPeople(next);
          return true;
        },
        onProgress: value => guard(() => setProgress(value)),
        onJob: id => {currentJob.current = id;},
      });
    } finally {
      running.current = false; currentJob.current = null;
      onBusy(false);
      guard(() => {
        setBusy(false);
        setMessage(`${result.completed} of ${items.length} processed, ${result.skipped} skipped (no photo, no face, locked or changed meanwhile), ${result.failures} failed.${result.stopped ? " Queue stopped." : ""}${result.error ? ` ${result.error}` : ""}`);
      });
    }
  };
  return <section className="panel stack" aria-label="Bulk student actions">
    <div className="inline"><button type="button" disabled={disabled || busy} onClick={() => onSelection(new Set(people.map(p => p.index)))}>Select all</button><button type="button" disabled={disabled || busy} onClick={() => onSelection(new Set())}>Select none</button><span>{selected.size} selected ({available.length} unlocked)</span></div>
    <div className="inline"><label>Bulk action <select aria-label="Bulk action" value={action} disabled={disabled || busy} onChange={e => setAction(e.target.value as BulkAction)}>
      <option value="clear-quotes">Clear quotes (no default)</option><option value="clear-baby">Clear baby photos (no default)</option><option value="exclude">Exclude from yearbook</option><option value="include">Include in yearbook</option><option value="name-size">Name font size</option><option value="quote-size">Quote font size</option>
    </select></label>
    {(action === "name-size" || action === "quote-size") && <label>Font size <input type="number" min={1} max={500} value={size} disabled={busy} onChange={e => setSize(Number(e.target.value))} /></label>}
    <button type="button" disabled={disabled || busy || !available.length || !Number.isInteger(size) || size < 1 || size > 500} onClick={() => onPeople(applyBulkPeople(people, selected, locked, action, size))}>Apply to selected</button></div>
    <p className="muted small">Photo processing uses each selected student's assigned baby photo, not defaults. Originals are kept. Students without photos or a detected face are skipped.</p>
    <div className="inline"><button type="button" disabled={disabled || busy || !available.length || !workspaceId} onClick={() => void process("face")}>Centre baby photos on faces</button><button type="button" disabled={disabled || busy || !available.length || !workspaceId} onClick={() => void process("background")}>Remove baby photo backgrounds</button>{busy && <button type="button" onClick={stopQueue}>Stop queue</button>}</div>
    {busy && <progress max={100} value={progress} aria-label="Bulk photo processing progress" />}
    {message && <p role="status">{message}</p>}
  </section>;
}
