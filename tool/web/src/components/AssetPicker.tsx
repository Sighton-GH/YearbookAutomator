import { useEffect, useState } from "react";
import { assetUrl, listAssets } from "../api";
import { formatServerMessage } from "../configFile";

export function AssetPicker({workspaceId, kind, disabled, onChoose}: {workspaceId: string; kind: "mugshot" | "baby"; disabled: boolean; onChoose: (filename: string) => void}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setNames([]);
    listAssets(workspaceId, kind).then(value => {if (!cancelled) setNames(value);})
      .catch(err => {if (!cancelled) setError(formatServerMessage(err));})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [open, workspaceId, kind]);
  return <div className="stack">
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>Choose from uploaded {kind === "mugshot" ? "portraits" : "baby photos"}</button>
    {open && <div>
      <label className="field"><span>Search uploaded {kind === "mugshot" ? "portraits" : "baby photos"}</span><input value={query} onChange={e => setQuery(e.target.value)} /></label>
      {loading && <p className="muted">Loading photos...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !names.length && <p className="muted">No uploaded photos</p>}
      <div className="asset-picker-grid">{names.filter(name => name.toLowerCase().includes(query.toLowerCase())).map(name => <button type="button" key={name} disabled={disabled} title={name} onClick={() => {onChoose(name); setOpen(false);}}>
        <img src={assetUrl(workspaceId, kind, name)} alt="" loading="lazy" /><span>{name}</span>
      </button>)}</div>
    </div>}
  </div>;
}
