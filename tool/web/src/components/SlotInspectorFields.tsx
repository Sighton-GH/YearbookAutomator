import type { BabyShape, SlotBoxKind, Box, TemplateSlots } from "../api";
import { clampBox } from "../utils/slots";

const PARTS: (SlotBoxKind)[] = ["mugshot", "baby_photo", "name", "quote"];

const PART_LABELS: Record<SlotBoxKind, string> = {
  mugshot: "Portrait",
  baby_photo: "Baby photo",
  name: "Name",
  quote: "Quote",
};

export function SlotInspectorFields({
  slot,
  onChange,
  templateSize,
}: {
  slot: TemplateSlots;
  onChange: (next: TemplateSlots) => void;
  templateSize?: { width: number; height: number } | null;
}) {
  const update = (part: SlotBoxKind, field: keyof Box, value: number) => {
    const raw = { ...slot[part], [field]: value };
    const next = templateSize ? clampBox(raw, templateSize) : { ...raw, x: Math.max(0, Math.round(raw.x)), y: Math.max(0, Math.round(raw.y)), width: Math.max(1, Math.round(raw.width)), height: Math.max(1, Math.round(raw.height)) };
    onChange({ ...slot, [part]: next });
  };

  const handleRaw = (part: SlotBoxKind, field: keyof Box, rawValue: string) => {
    if (rawValue.trim() === "") return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    update(part, field, value);
  };

  return (
    <div className="slot-inspector-fields">
      <label className="field"><span>Cutout shape</span>
        <select aria-label="Cutout shape" value={slot.baby_shape ?? "auto"} onChange={event => onChange({ ...slot, baby_shape: event.target.value as BabyShape })}>
          <option value="auto">Auto (blue guide)</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="rounded">Rounded</option>
        </select>
      </label>
      {PARTS.map((part) => (
        <div key={part} className="slot-inspector-part">
          <div className="slot-inspector-part-label">{PART_LABELS[part]}</div>
          <div className="slot-inspector-grid">
            <label>
              <span>X</span>
              <input
                type="number"
                min={0}
                step={1}
                value={slot[part].x}
                onChange={(e) => handleRaw(part, "x", e.target.value)}
              />
            </label>
            <label>
              <span>Y</span>
              <input
                type="number"
                min={0}
                step={1}
                value={slot[part].y}
                onChange={(e) => handleRaw(part, "y", e.target.value)}
              />
            </label>
            <label>
              <span>W</span>
              <input
                type="number"
                min={0}
                step={1}
                value={slot[part].width}
                onChange={(e) => handleRaw(part, "width", e.target.value)}
              />
            </label>
            <label>
              <span>H</span>
              <input
                type="number"
                min={0}
                step={1}
                value={slot[part].height}
                onChange={(e) => handleRaw(part, "height", e.target.value)}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
