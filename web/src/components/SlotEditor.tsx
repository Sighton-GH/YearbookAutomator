import { Fragment, useState } from "react";
import { clsx } from "clsx";
import type { Box, TemplateSlots } from "../api";

export function SlotEditor({
  slots,
  onChange,
  onSelectSlot,
  selectedSlot,
  parsedSlots,
  onResetToParsed,
}: {
  slots: TemplateSlots[];
  onChange: (s: TemplateSlots[]) => void;
  onSelectSlot?: (idx: number) => void;
  selectedSlot?: number | null;
  parsedSlots?: TemplateSlots[];
  onResetToParsed?: () => void;
}) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  if (!slots.length) return null;

  const update = (slotIdx: number, key: keyof TemplateSlots, field: keyof Box, value: number) => {
    const next = slots.map((slot, i) => {
      if (i !== slotIdx) return slot;
      const targetBox = { ...slot[key], [field]: value } as Box;
      return { ...slot, [key]: targetBox } as TemplateSlots;
    });
    onChange(next);
  };

  const parts: (keyof TemplateSlots)[] = ["mugshot", "baby_photo", "name", "quote"];
  const partLabels: Record<keyof TemplateSlots, string> = {
    mugshot: "Portrait",
    baby_photo: "Baby",
    name: "Name",
    quote: "Quote",
  };

  const toggleExpand = (idx: number) => {
    setExpandedSlot(expandedSlot === idx ? null : idx);
    onSelectSlot?.(idx);
  };

  return (
    <div className="slot-editor-table">
      <div className="slot-editor-header">
        <span className="muted small">Click row to expand. {slots.length} slots detected.</span>
        {parsedSlots && parsedSlots.length > 0 && onResetToParsed && (
          <button type="button" className="chip small danger" onClick={onResetToParsed}>
            ↺ Reset to parsed
          </button>
        )}
      </div>
      <table className="slot-table">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Slot</th>
            <th>Type</th>
            <th>X</th>
            <th>Y</th>
            <th>W×H</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, idx) => {
            const isExpanded = expandedSlot === idx;
            const isActive = selectedSlot === idx;
            return (
              <Fragment key={idx}>
                <tr className={clsx("slot-row-main", { active: isActive, expanded: isExpanded })} onClick={() => toggleExpand(idx)}>
                  <td className="expand-cell">{isExpanded ? "▾" : "▸"}</td>
                  <td className="slot-num-cell">#{idx + 1}</td>
                  <td colSpan={4} className="slot-summary-cell">
                    {isExpanded ? "" : `${slot.mugshot.width}×${slot.mugshot.height} @ (${slot.mugshot.x}, ${slot.mugshot.y})`}
                  </td>
                </tr>
                {isExpanded &&
                  parts.map((part) => (
                    <tr key={`${idx}-${part}`} className="slot-detail-row">
                      <td></td>
                      <td></td>
                      <td className="part-label-cell">{partLabels[part]}</td>
                      <td>
                        <input
                          type="number"
                          value={slot[part].x}
                          onChange={(e) => update(idx, part, "x", Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={slot[part].y}
                          onChange={(e) => update(idx, part, "y", Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="size-cell">
                        <input
                          type="number"
                          value={slot[part].width}
                          onChange={(e) => update(idx, part, "width", Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>×</span>
                        <input
                          type="number"
                          value={slot[part].height}
                          onChange={(e) => update(idx, part, "height", Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
