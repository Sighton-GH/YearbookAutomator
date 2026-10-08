import type { PhotoSettings } from "../photoSettings";
export function PhotoSettingsPanel({ settings, onChange }: {
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
    {(["mugshot", "baby"] as const).map(kind => <fieldset key={kind}>
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
    </fieldset>)}
  </section>;
}
