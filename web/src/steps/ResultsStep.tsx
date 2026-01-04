import { generationDownloadAllUrl, generationDownloadSpreadsheetUrl, generationDownloadUrl } from "../api";

export function ResultsStep({
  outputPath,
  outputPaths,
  workspaceId,
  outputNonce,
  usageInfo,
}: {
  outputPath: string | null;
  outputPaths: string[];
  workspaceId: string | null;
  outputNonce: number;
  usageInfo?: { remaining: number; limit: number; period: "month" | "lifetime" } | null;
}) {
  if (!workspaceId) return <p className="muted">Missing workspace.</p>;
  const rawFiles = (outputPaths && outputPaths.length ? outputPaths : outputPath ? [outputPath] : [])
    .map((p) => p.split(/[\\/]/).pop() || p)
    .filter(Boolean);
  const parseSpreadNumber = (fname: string) => {
    const m = fname.match(/output_(\d+)\.png$/i);
    return m ? Number(m[1]) : null;
  };
  const files = [...rawFiles].sort((a, b) => {
    const an = parseSpreadNumber(a);
    const bn = parseSpreadNumber(b);
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1;
    if (bn != null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  if (!files.length) return <p className="muted">No output generated yet.</p>;

  return (
    <div className="stack">
      {usageInfo && typeof usageInfo.remaining === "number" && typeof usageInfo.limit === "number" ? (
        <div className="callout">
          <div className="stack" style={{ gap: 4 }}>
            <strong>License usage</strong>
            <div className="muted small">
              Uses remaining{usageInfo.period === "month" ? " this month" : ""}: <strong>{usageInfo.remaining}</strong> of {usageInfo.limit}
            </div>
          </div>
        </div>
      ) : null}

      <div className="callout">
        <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
          <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              Rendered spreads: <strong>{files.length}</strong>
            </div>
            <span className="muted small">(chronological order)</span>
          </div>
          <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="primary"
              onClick={() => {
                window.open(generationDownloadAllUrl(workspaceId), "_blank");
              }}
            >
              Download all spreads
            </button>
            <button
              onClick={() => {
                window.open(generationDownloadSpreadsheetUrl(workspaceId), "_blank");
              }}
            >
              Download spreadsheet
            </button>
          </div>
        </div>
      </div>

      {files.map((fname, idx) => {
        const spreadNumber = parseSpreadNumber(fname) ?? idx + 1;
        return (
          <div key={fname} className="stack" style={{ gap: 8 }}>
            <div className="inline" style={{ justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
              <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
                <strong>Spread {spreadNumber}</strong>
                <span className="muted">{fname}</span>
              </div>
              <button
                onClick={() => {
                  window.open(generationDownloadUrl(workspaceId, fname), "_blank");
                }}
              >
                Download
              </button>
            </div>
            <img
              src={generationDownloadUrl(workspaceId, fname, { cache: `${outputNonce}-${idx}` })}
              alt={`spread-${spreadNumber}`}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12 }}
            />
          </div>
        );
      })}
    </div>
  );
}
