import type { Box, TemplateSlots } from "../api";

const PARTS: (keyof TemplateSlots)[] = ["mugshot", "baby_photo", "name", "quote"];

const PART_LABELS: Record<keyof TemplateSlots, string> = {
  mugshot: "Portrait",
  baby_photo: "Baby photo",
  name: "Name",
  quote: "Quote",
};

export function SlotInspectorFields({
  slot,
  onChange,
}: {
  slot: TemplateSlots;
  onChange: (next: TemplateSlots) => void;
}) {
  const update = (part: keyof TemplateSlots, field: keyof Box, value: number) => {
    onChange({ ...slot, [part]: { ...slot[part], [field]: value } });
  };

  return (
    <div className="slot-inspector-fields">
      {PARTS.map((part) => (
        <div key={part} className="slot-inspector-part">
          <div className="slot-inspector-part-label">{PART_LABELS[part]}</div>
          <div className="slot-inspector-grid">
            <label>
              <span>X</span>
              <input
                type="number"
                value={slot[part].x}
                onChange={(e) => update(part, "x", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Y</span>
              <input
                type="number"
                value={slot[part].y}
                onChange={(e) => update(part, "y", Number(e.target.value))}
              />
            </label>
            <label>
              <span>W</span>
              <input
                type="number"
                value={slot[part].width}
                onChange={(e) => update(part, "width", Number(e.target.value))}
              />
            </label>
            <label>
              <span>H</span>
              <input
                type="number"
                value={slot[part].height}
                onChange={(e) => update(part, "height", Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
