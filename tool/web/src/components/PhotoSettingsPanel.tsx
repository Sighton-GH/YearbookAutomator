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
  </section>;
}
