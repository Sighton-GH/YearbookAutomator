import { useState } from "react";
import type { PersonRecord, TemplateSlots } from "../api";
import { moveToSpread, resolvePersonSlots } from "../utils/personPosition";

export type PositionSettings = {
  slots: TemplateSlots[]; slotNumberToIndex: number[]; assignments: Record<number, number>;
  perSpread: number; forceAlphabetical: boolean;
  onAssignments: (next: Record<number, number>) => void;
};
export function StudentPosition({person, people, settings, disabled, onPeople}: {person: PersonRecord; people: PersonRecord[]; settings: PositionSettings; disabled: boolean; onPeople: (next: PersonRecord[]) => void}) {
  const active = people.filter(p => !p.excluded);
  const perSpread = Math.max(1, Math.min(settings.perSpread || 1, settings.slots.length));
  const currentSpread = Math.max(1, Math.floor(active.findIndex(p => p.index === person.index) / perSpread) + 1);
  const [spread, setSpread] = useState(currentSpread);
  const [slot, setSlot] = useState(settings.assignments[person.index] ?? 1);
  const [preview, setPreview] = useState(false);
  const moved = moveToSpread(people, person.index, spread, perSpread);
  const assignments = {...settings.assignments, [person.index]: slot};
  const previewPeople = moved.filter(p => !p.excluded).slice((spread - 1) * perSpread, spread * perSpread);
  const resolved = resolvePersonSlots(previewPeople, settings.slots.length, assignments);
  const width = Math.max(1, ...settings.slots.map(s => s.mugshot.x + s.mugshot.width));
  const height = Math.max(1, ...settings.slots.map(s => s.mugshot.y + s.mugshot.height));
  const unavailable = disabled || person.excluded || settings.forceAlphabetical || !settings.slots.length;
  return <section className="pi-section"><div className="inspector-section-title">Position</div>
    {settings.forceAlphabetical && <p className="muted small">Turn off alphabetical ordering in Review to set a student's spread.</p>}
    <label className="field"><span>Spread number</span><input type="number" min={1} max={Math.max(1, Math.ceil(active.length / perSpread))} disabled={unavailable} value={spread} onChange={e => {setSpread(Math.max(1, Math.min(Math.ceil(active.length / perSpread), Number(e.target.value) || 1))); setPreview(false);}} /></label>
    <label className="field"><span>Slot number</span><select disabled={unavailable} value={slot} onChange={e => {setSlot(Number(e.target.value)); setPreview(false);}}>{settings.slots.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
    <svg role="img" aria-label="Numbered portrait slots" viewBox={`0 0 ${width} ${height}`} style={{width: "100%", maxHeight: 180}}>
      {settings.slotNumberToIndex.map((actual, i) => {const box = settings.slots[actual].mugshot; return <g key={i}><rect {...{x: box.x, y: box.y, width: box.width, height: box.height}} fill={slot === i + 1 ? "#dae8ff" : "#eee"} stroke="#666" /><text x={box.x + box.width / 2} y={box.y + box.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(12, box.height / 3)} fill="#141e32">{i + 1}</text></g>;})}
    </svg>
    <button type="button" disabled={unavailable} onClick={() => setPreview(true)}>Preview position change</button>
    {preview && <div className="stack"><p className="muted small">Explicit positions claim first. The first student in list order keeps a conflicting slot; the others move to free slots. Moving spreads exchanges this student with the first student on that spread.</p>
      {previewPeople.map((p, i) => <p className="small" key={p.index}>{p.first_name} {p.last_name}: spread {spread}, slot {resolved[i]}{assignments[p.index] && assignments[p.index] !== resolved[i] ? " (requested slot occupied)" : ""}</p>)}
      <button type="button" disabled={unavailable} onClick={() => {onPeople(moved); settings.onAssignments(assignments); setPreview(false);}}>Apply position</button>
    </div>}
    <button type="button" disabled={unavailable || settings.assignments[person.index] == null} onClick={() => {const next = {...settings.assignments}; delete next[person.index]; settings.onAssignments(next);}}>Reset slot to automatic</button>
  </section>;
}
