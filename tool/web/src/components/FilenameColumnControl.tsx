import type {FilenameColumnCandidate} from "../api";

export function FilenameColumnControl({candidates, value, onChange, disabled}: {candidates: FilenameColumnCandidate[]; value: string | null | undefined; onChange: (value: string | null | undefined) => void; disabled: boolean}) {
  const column = value || candidates.find(c => c.suggested)?.column || candidates[0]?.column;
  if (!column) return null;
  return <section className="stack">
    <label className="inline"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(e.target.checked ? column : null)} />Match portraits using the '{column}' column</label>
    {candidates.length > 1 && <label className="field"><span>Portrait filename column</span><select value={column} disabled={disabled} onChange={e => onChange(e.target.value)}>{candidates.map(c => <option key={c.column} value={c.column}>{c.column} ({c.found}/{c.listed} files found)</option>)}</select></label>}
    <p className="muted small">Columns are checked during ingest. Filename matching is turned on automatically when at least 80% of listed files exist in the ZIP, unless you turned it off. Changing this option requires re-ingesting the roster.</p>
  </section>;
}
