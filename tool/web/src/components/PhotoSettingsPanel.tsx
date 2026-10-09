import type { PhotoSettings } from "../photoSettings";
export function PhotoSettingsPanel({ settings, onChange, size, outputFormat }: {
  size?: { width: number; height: number } | null; outputFormat?: string;
  settings: PhotoSettings; onChange: (settings: PhotoSettings) => void;
}) {
  return <section className="panel"><h3>Portrait framing</h3>
    <label className="field"><span>Fit</span><select value={settings.mugshot_fit ?? "cover"}
      onChange={e => onChange({ ...settings, mugshot_fit: e.target.value as "cover" | "contain" })}>
      <option value="cover">Fill the box (crop)</option><option value="contain">Show the whole portrait</option>
    </select></label>
    <label><input type="checkbox" checked={settings.mugshot_face_aware ?? false}
      onChange={e => onChange({ ...settings, mugshot_face_aware: e.target.checked })} /> Centre crop on face</label>
    {settings.mugshot_fit === "contain" && <label className="field"><span>Fill colour</span>
      <input type="color" value={settings.contain_fill_color ?? "#ffffff"}
        onChange={e => onChange({ ...settings, contain_fill_color: e.target.value })} /></label>}
    <fieldset><legend>Print</legend>
      <label className="field"><span>DPI (72 to 1200)</span><input type="number" min={72} max={1200} list="print-dpi-options"
        value={settings.output_dpi ?? 300} onChange={e => onChange({ ...settings,
          output_dpi: Math.max(72, Math.min(1200, Math.round(Number(e.target.value)))) })} />
        <datalist id="print-dpi-options">{[72, 150, 300, 600].map(v => <option value={v} key={v} />)}</datalist></label>
      {size && <p>Physical size per spread: {(size.width / (settings.output_dpi ?? 300) * 25.4).toFixed(1)} ×
        {(size.height / (settings.output_dpi ?? 300) * 25.4).toFixed(1)} mm</p>}
      <p className="muted small">DPI changes physical print size, not pixels. Portrait resolution warnings appear after rendering.</p>
      <label><input type="checkbox" disabled={outputFormat !== "pdf"} checked={settings.crop_marks ?? false}
        onChange={e => onChange({ ...settings, crop_marks: e.target.checked })} /> PDF crop marks (adds 0.25 in on each edge)</label>
    </fieldset>
    {(["mugshot", "baby"] as const).map(kind => <details key={kind}><summary>{kind === "mugshot" ? "Portrait shape, border and shadow" : "Baby shape, border and shadow"}</summary><fieldset>
      <legend>{kind === "mugshot" ? "Portrait shape" : "Baby photo shape (auto rectangle masks only)"}</legend>
      <label className="field"><span>Shape</span><select value={settings[`${kind}_shape`] ?? "rect"}
        onChange={e => onChange({ ...settings, [`${kind}_shape`]: e.target.value })}>
        <option value="rect">Rectangle</option><option value="rounded">Rounded corners</option><option value="ellipse">Ellipse</option>
      </select></label>
      <label className="field"><span>Corner radius (px)</span><input type="number" min={0} max={500}
        value={settings[`${kind}_corner_radius`] ?? 0} onChange={e => onChange({ ...settings,
          [`${kind}_corner_radius`]: Math.max(0, Math.min(500, Number(e.target.value))) })} /></label>
      <label className="field"><span>Border width (px)</span><input type="number" min={0} max={100}
        value={settings[`${kind}_border_width`] ?? 0} onChange={e => onChange({ ...settings,
          [`${kind}_border_width`]: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>
      <label className="field"><span>Border colour</span><input type="color" value={settings[`${kind}_border_color`] ?? "#ffffff"}
        onChange={e => onChange({ ...settings, [`${kind}_border_color`]: e.target.value })} /></label>
      <label><input type="checkbox" checked={Boolean(settings[`${kind}_shadow`])}
        onChange={e => onChange({ ...settings, [`${kind}_shadow`]: e.target.checked ?
          { color: "#000000", opacity: 0.4, offset_x: 4, offset_y: 4, blur: 6 } : null })} /> Shadow</label>
      {settings[`${kind}_shadow`] && <>
        <label className="field"><span>Shadow colour</span><input type="color" value={settings[`${kind}_shadow`]!.color}
          onChange={e => onChange({ ...settings, [`${kind}_shadow`]: { ...settings[`${kind}_shadow`]!, color: e.target.value } })} /></label>
        {(["opacity", "offset_x", "offset_y", "blur"] as const).map(field => <label className="field" key={field}>
          <span>Shadow {field.replace("_", " ")}</span><input type="number" min={field === "opacity" || field === "blur" ? 0 : -500}
            max={field === "opacity" ? 1 : field === "blur" ? 100 : 500} step={field === "opacity" ? 0.05 : 1}
            value={settings[`${kind}_shadow`]![field]} onChange={e => onChange({ ...settings,
              [`${kind}_shadow`]: { ...settings[`${kind}_shadow`]!, [field]: Math.max(field === "opacity" || field === "blur" ? 0 : -500,
                Math.min(field === "opacity" ? 1 : field === "blur" ? 100 : 500, Number(e.target.value))) } })} />
        </label>)}
      </>}
    </fieldset></details>)}
  </section>;
}
