export function SafeAreaPreview({ size, src, dpi, settings, onChange }: {
  size: { width: number; height: number }; src: string | null; dpi: number;
  settings: { show: boolean; bleed_mm: number; safe_mm: number };
  onChange: (settings: { show: boolean; bleed_mm: number; safe_mm: number }) => void;
}) {
  const safe = Math.min(settings.safe_mm * dpi / 25.4, size.width / 2, size.height / 2);
  const bleed = Math.min(settings.bleed_mm * dpi / 25.4, size.width / 2, size.height / 2);
  return <section className="panel"><label><input type="checkbox" checked={settings.show}
    onChange={e => onChange({ ...settings, show: e.target.checked })} /> Show safe area (preview only)</label>
    {settings.show && <>
      {(["bleed_mm", "safe_mm"] as const).map(key => <label className="field" key={key}>
        <span>{key === "bleed_mm" ? "Bleed guide inset (mm)" : "Safe area inset (mm)"}</span>
        <input type="number" min={0} max={100} value={settings[key]} step={0.5}
          onChange={e => onChange({ ...settings, [key]: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>)}
      <p className="muted small">Red: bleed guide. Blue: safe area. Guides do not change the output or add bleed artwork.</p>
      <svg role="img" aria-label="Template with bleed and safe-area guides" viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ width: "100%", maxHeight: 450 }}>
        {src && <image href={src} width={size.width} height={size.height} />}
        <rect x={bleed} y={bleed} width={size.width - bleed * 2} height={size.height - bleed * 2}
          fill="none" stroke="red" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <rect x={safe} y={safe} width={size.width - safe * 2} height={size.height - safe * 2}
          fill="none" stroke="blue" strokeWidth={2} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
      </svg>
    </>}
  </section>;
}
