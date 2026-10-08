import {useEffect, useRef, useState} from "react";
import {assetUrl, cancelRemoveBackgroundJob, removeBackgroundStatus, startRemoveBackgroundJob, uploadImage, type BackgroundMode, type PersonRecord} from "../api";
import {formatServerMessage} from "../configFile";
import {applyBulkPeople, type BulkAction} from "../utils/bulkPeople";
import {faceCentreImage} from "../utils/faceCentreImage";

export function BulkPeopleToolbar({people, selected, onSelection, locked, workspaceId, disabled, onPeople, onBusy, babyAspect, backgroundMode}: {
  people: PersonRecord[]; selected: Set<number>; onSelection: (value: Set<number>) => void; locked: Record<number, true>;
  workspaceId: string | null; disabled: boolean; onPeople: (value: PersonRecord[]) => void; onBusy: (value: boolean) => void; babyAspect: number; backgroundMode: BackgroundMode;
}) {
  const [action, setAction] = useState<BulkAction>("clear-quotes");
  const [size, setSize] = useState(40);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const stopped = useRef(false);
  const currentJob = useRef<string | null>(null);
  useEffect(() => () => {stopped.current = true; if (currentJob.current) void cancelRemoveBackgroundJob(currentJob.current).catch(() => undefined);}, []);
  const available = people.filter(p => selected.has(p.index) && !locked[p.index]);
  const process = async (mode: "background" | "face") => {
    if (!workspaceId || busy || disabled) return;
    stopped.current = false; setBusy(true); onBusy(true); setProgress(0); setMessage("");
    let next = people;
    let completed = 0;
    let skipped = 0;
    let failures = 0;
    try {
      for (const person of available) {
        if (stopped.current) break;
        const filename = person.baby_photo_filename;
        if (!filename) {skipped++; completed++; setProgress(completed / available.length * 100); continue;}
        try {
          let output: string | null = null;
          if (mode === "background") {
            const job = await startRemoveBackgroundJob({workspaceId, kind: "baby", filename, backgroundMode});
            currentJob.current = job.job_id;
            const deadline = Date.now() + 10 * 60 * 1000;
            while (!stopped.current) {
              const status = await removeBackgroundStatus(job.job_id);
              setProgress((completed + status.progress / 100) / available.length * 100);
              if (status.status === "done") {output = status.output_filename; break;}
              if (status.status === "error" || status.status === "cancelled" || status.error) throw new Error(status.error || status.message || "Photo processing stopped");
              if (Date.now() > deadline) throw new Error("Photo processing timed out");
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (stopped.current) await cancelRemoveBackgroundJob(job.job_id);
            currentJob.current = null;
          } else {
            const response = await fetch(assetUrl(workspaceId, "baby", filename));
            if (!response.ok) throw new Error("Could not load the baby photo");
            const blob = await faceCentreImage(await response.blob(), babyAspect);
            if (blob && !stopped.current) output = await uploadImage(workspaceId, "baby", new File([blob], "face-centred.png", {type: "image/png"}));
            else skipped++;
          }
          if (output && !stopped.current) {
            next = next.map(p => p.index === person.index ? {...p, baby_photo_filename: output, baby_background_removal_failed: false} : p);
            onPeople(next);
          }
        } catch (err) {
          failures++; setMessage(formatServerMessage(err));
          if (currentJob.current) {await cancelRemoveBackgroundJob(currentJob.current).catch(() => undefined); currentJob.current = null;}
          // Stop on an API refusal or failure rather than hammering the same endpoint.
          stopped.current = true;
        }
        completed++; setProgress(completed / available.length * 100);
      }
    } finally {
      setBusy(false); onBusy(false);
      setMessage(prev => `${completed} of ${available.length} processed, ${skipped} skipped (no photo or face), ${failures} failed.${stopped.current ? " Queue stopped." : ""}${prev ? ` ${prev}` : ""}`);
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
    <div className="inline"><button type="button" disabled={disabled || busy || !available.length || !workspaceId} onClick={() => void process("face")}>Centre baby photos on faces</button><button type="button" disabled={disabled || busy || !available.length || !workspaceId} onClick={() => void process("background")}>Remove baby photo backgrounds</button>{busy && <button type="button" onClick={() => {stopped.current = true;}}>Stop queue</button>}</div>
    {busy && <progress max={100} value={progress} aria-label="Bulk photo processing progress" />}
    {message && <p role="status">{message}</p>}
  </section>;
}
