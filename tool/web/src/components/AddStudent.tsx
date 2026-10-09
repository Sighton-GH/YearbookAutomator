import { useState } from "react";

export function AddStudent({disabled, onAdd}: {disabled: boolean; onAdd: (first: string, last: string, quote: string, portrait: File | null) => Promise<void>}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [quote, setQuote] = useState("");
  const [portrait, setPortrait] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return <details className="panel"><summary>Add student</summary>
    <form className="stack" onSubmit={async e => {
      e.preventDefault(); if (busy || disabled) return;
      setBusy(true); try { await onAdd(first.trim(), last.trim(), quote, portrait); } finally { setBusy(false); }
    }}>
      <label className="field"><span>First name</span><input required maxLength={200} value={first} onChange={e => setFirst(e.target.value)} /></label>
      <label className="field"><span>Last name</span><input maxLength={200} value={last} onChange={e => setLast(e.target.value)} /></label>
      <label className="field"><span>Quote (optional)</span><textarea maxLength={2000} value={quote} onChange={e => setQuote(e.target.value)} /></label>
      <label className="field"><span>Portrait (optional)</span><input type="file" accept="image/*" onChange={e => setPortrait(e.target.files?.[0] ?? null)} /></label>
      <button type="submit" disabled={busy || disabled}>{busy ? "Adding student..." : "Add student"}</button>
    </form>
  </details>;
}
