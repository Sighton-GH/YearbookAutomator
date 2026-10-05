import type React from "react";
import { useRef, useState } from "react";
import type { Box, TemplateSlots } from "../api";
import { clampBox } from "../utils/slots";

export function TemplatePreview({
  slots,
  size,
  backgroundUrl,
  selectedSlot,
  onSelectSlot,
  onUpdate,
}: {
  slots: TemplateSlots[];
  size: { width: number; height: number } | null;
  backgroundUrl?: string | null;
  selectedSlot?: number | null;
  onSelectSlot?: (idx: number) => void;
  onUpdate?: (slots: TemplateSlots[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    slotIdx: number;
    part: keyof TemplateSlots;
    mode: "move" | "resize";
    handle?: "nw" | "ne" | "sw" | "se";
    startBox: Box;
    origin: { x: number; y: number };
  } | null>(null);

  if (!size || !slots.length) {
    return <div className="canvas">Upload templates to see regions.</div>;
  }

  const aspect = size.width / size.height;
  const viewW = 720;
  const viewH = Math.round(viewW / aspect);

  const clientToSvg = (evt: React.MouseEvent<SVGElement, MouseEvent>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = size.width / rect.width;
    const scaleY = size.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  };

  const updateSlot = (slotIdx: number, part: keyof TemplateSlots, updater: (b: Box) => Box) => {
    if (!onUpdate) return;
    const next = slots.map((slot, i) => {
      if (i !== slotIdx) return slot;
      return { ...slot, [part]: clampBox(updater(slot[part]), size) } as TemplateSlots;
    });
    onUpdate(next);
  };

  const onMouseDown = (
    evt: React.MouseEvent<SVGRectElement | SVGCircleElement, MouseEvent>,
    slotIdx: number,
    part: keyof TemplateSlots,
    mode: "move" | "resize",
    handle?: "nw" | "ne" | "sw" | "se"
  ) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (onSelectSlot) onSelectSlot(slotIdx);
    const point = clientToSvg(evt);
    setDrag({ slotIdx, part, mode, handle, startBox: { ...slots[slotIdx][part] }, origin: point });
  };

  const onMouseMove = (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!drag) return;
    evt.preventDefault();
    const point = clientToSvg(evt);
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    updateSlot(drag.slotIdx, drag.part, (box) => {
      if (drag.mode === "move") {
        return { ...box, x: Math.max(0, drag.startBox.x + dx), y: Math.max(0, drag.startBox.y + dy) };
      }
      let { x, y, width, height } = drag.startBox;
      const minSize = 10;
      switch (drag.handle) {
        case "nw":
          x = drag.startBox.x + dx;
          y = drag.startBox.y + dy;
          width = drag.startBox.width - dx;
          height = drag.startBox.height - dy;
          break;
        case "ne":
          y = drag.startBox.y + dy;
          width = drag.startBox.width + dx;
          height = drag.startBox.height - dy;
          break;
        case "sw":
          x = drag.startBox.x + dx;
          width = drag.startBox.width - dx;
          height = drag.startBox.height + dy;
          break;
        case "se":
        default:
          width = drag.startBox.width + dx;
          height = drag.startBox.height + dy;
          break;
      }
      return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.max(minSize, Math.round(width)),
        height: Math.max(minSize, Math.round(height)),
      };
    });
  };

  const onMouseUp = () => setDrag(null);

  const renderHandles = (slotIdx: number, part: keyof TemplateSlots, box: Box) => {
    const handles: ("nw" | "ne" | "sw" | "se")[] = ["nw", "ne", "sw", "se"];
    const coords = {
      nw: { cx: box.x, cy: box.y },
      ne: { cx: box.x + box.width, cy: box.y },
      sw: { cx: box.x, cy: box.y + box.height },
      se: { cx: box.x + box.width, cy: box.y + box.height },
    } as const;
    return handles.map((h) => (
      <circle
        key={`${part}-${h}`}
        cx={coords[h].cx}
        cy={coords[h].cy}
        r={8}
        fill="#0ea5e9"
        stroke="#0f172a"
        strokeWidth={1.5}
        onMouseDown={(evt) => onMouseDown(evt, slotIdx, part, "resize", h)}
      />
    ));
  };

  return (
    <div className="canvas" style={{ position: "relative", padding: 0, height: viewH, width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 10 }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {backgroundUrl && (
          <image
            href={backgroundUrl}
            width={size.width}
            height={size.height}
            opacity={1}
            style={{ pointerEvents: "none" }}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {slots.map((slot, i) => {
          const isSelected = selectedSlot === i;
          return (
            <g key={i}>
              {(["mugshot", "baby_photo", "name", "quote"] as (keyof TemplateSlots)[]).map((part) => (
                <g key={part}>
                  <rect
                    {...rectProps(slot[part], getStroke(part), `${part}-${i + 1}`, isSelected)}
                    onMouseDown={(evt) => onMouseDown(evt, i, part, "move")}
                    cursor="move"
                  />
                  {renderHandles(i, part, slot[part])}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getStroke(part: keyof TemplateSlots) {
  switch (part) {
    case "mugshot":
      return "#22c55e";
    case "baby_photo":
      return "#3b82f6";
    case "name":
      return "#f97316"; // orange
    case "quote":
    default:
      return "#ff3131"; // red
  }
}

function rectProps(box: Box, strokeColor: string, label: string, isSelected: boolean) {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rx: 6,
    ry: 6,
    fill: isSelected ? "rgba(14,165,233,0.14)" : "rgba(15,23,42,0.06)",
    stroke: isSelected ? "#0ea5e9" : strokeColor,
    strokeWidth: isSelected ? 3 : 2,
    opacity: isSelected ? 1 : 0.95,
    ["data-label"]: label,
    style: isSelected
      ? { filter: "drop-shadow(0 0 14px rgba(56,189,248,0.95))", transition: "all 120ms ease" }
      : { transition: "all 120ms ease" },
  } as const;
}
