import type { PersonRecord } from "../api";

export function StudentOverrides({person, disabled, onPatch}: {person: PersonRecord; disabled: boolean; onPatch: (patch: Partial<PersonRecord>) => void}) {
  return <section className="pi-section"><div className="inspector-section-title">Overrides for this student</div>
    {(["name_font_size", "quote_font_size"] as const).map(field => <label key={field} className="field">
      <span>{field === "name_font_size" ? "Name" : "Quote"} font size (blank uses global)</span>
      <input type="number" min={1} max={500} value={person[field] ?? ""} disabled={disabled} onChange={e => {
        const value = e.target.value === "" ? null : Number(e.target.value);
        if (value === null || (Number.isInteger(value) && value >= 1 && value <= 500)) onPatch({[field]: value});
      }} />
      <button type="button" disabled={disabled || person[field] == null} onClick={() => onPatch({[field]: null})}>Reset to global</button>
    </label>)}
    {(["name_color", "quote_color"] as const).map(field => <label key={field} className="field">
      <span>{field === "name_color" ? "Name" : "Quote"} colour {person[field] == null ? "(global)" : person[field]}</span>
      <input type="color" value={person[field] ?? "#141e32"} disabled={disabled} onChange={e => onPatch({[field]: e.target.value})} />
      <button type="button" disabled={disabled || person[field] == null} onClick={() => onPatch({[field]: null})}>Reset to global</button>
    </label>)}
    <label className="field"><span>Baby photo</span><select disabled={disabled} value={person.hide_baby_photo == null ? "global" : person.hide_baby_photo ? "hide" : "show"} onChange={e => onPatch({hide_baby_photo: e.target.value === "global" ? null : e.target.value === "hide"})}>
      <option value="global">Use global setting</option><option value="hide">Hide for this student</option><option value="show">Show for this student</option>
    </select></label>
  </section>;
}
