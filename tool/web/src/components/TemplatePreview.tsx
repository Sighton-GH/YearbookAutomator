import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { RawParseDebug, SlotBoxKind, Box, TemplateSlots } from "../api";
import { clampBox } from "../utils/slots";
import { DEFAULT_VIEWPORT, handleRadiusImagePx, nudgeBox, panBy, screenToImage, strokeWidthImagePx, zoomAt } from "../utils/layout/viewport";

const PARTS: SlotBoxKind[] = ["mugshot", "baby_photo", "name", "quote"];
const COLORS = { mugshot: "#22c55e", baby_photo: "#3b82f6", name: "#f97316", quote: "#ff3131" };
type Handle = "nw" | "ne" | "sw" | "se";
type Drag = { slotIdx: number; part: SlotBoxKind; handle?: Handle; startBox: Box; origin: { x: number; y: number }; key: string };

export function TemplatePreview({ slots, size, backgroundUrl, selectedSlot, onSelectSlot, onUpdate, slotNumbers, renumbering = false, renumberClicks = [], rawDebug, onGestureActive }: {
  slots: TemplateSlots[];
  rawDebug?: RawParseDebug | null;
  onGestureActive?: (active: boolean) => void;
  size: { width: number; height: number } | null;
  backgroundUrl?: string | null;
  selectedSlot?: number | null;
  onSelectSlot?: (idx: number) => void;
  onUpdate?: (slots: TemplateSlots[], gestureKey?: string) => void;
  slotNumbers?: number[];
  renumbering?: boolean;
  renumberClicks?: number[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [focused, setFocused] = useState(false);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [selectedPart, setSelectedPart] = useState<SlotBoxKind>("mugshot");
  const drag = useRef<Drag | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  const nudgeKey = useRef<string | null>(null);
  const baseScale = size ? containerWidth / size.width : 1;
  const scale = baseScale * viewport.zoom;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [size]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      setViewport(v => zoomAt(v, Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [size]);

  if (!size) return <div className="canvas">Upload templates to see regions.</div>;

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const updateBox = (index: number, part: SlotBoxKind, box: Box, key?: string) => {
    onUpdate?.(slots.map((slot, i) => i === index ? { ...slot, [part]: clampBox(box, size) } : slot), key);
  };
  const begin = (event: React.PointerEvent<SVGElement>, index: number, part: SlotBoxKind, handle?: Handle) => {
    if (space.current || pointers.current.size > 1) return;
    event.preventDefault();
    onSelectSlot?.(index);
    setSelectedPart(part);
    if (renumbering) return;
    onGestureActive?.(true);
    drag.current = { slotIdx: index, part, handle, startBox: { ...slots[index][part] }, origin: screenToImage(localPoint(event), viewport, baseScale), key: `drag-${crypto.randomUUID()}` };
  };
  const end = (event: React.PointerEvent) => {
    onGestureActive?.(false);
    pointers.current.delete(event.pointerId);
    drag.current = null; pan.current = null; pinchDistance.current = null;
    if (containerRef.current?.hasPointerCapture(event.pointerId)) containerRef.current.releasePointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current && distance > 0) {
        const factor = distance / pinchDistance.current;
        setViewport(v => zoomAt(v, factor, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
      }
      pinchDistance.current = distance;
      drag.current = null;
      return;
    }
    if (pan.current) {
      const previous = pan.current;
      setViewport(v => panBy(v, point.x - previous.x, point.y - previous.y));
      pan.current = point;
      return;
    }
    const d = drag.current;
    if (!d || !slots[d.slotIdx]) return;
    const image = screenToImage(point, viewport, baseScale);
    const dx = image.x - d.origin.x, dy = image.y - d.origin.y;
    const b = d.startBox;
    if (!d.handle) {
      updateBox(d.slotIdx, d.part, { ...b, x: Math.max(0, Math.min(size.width - b.width, b.x + dx)), y: Math.max(0, Math.min(size.height - b.height, b.y + dy)) }, d.key);
    } else {
      const left = d.handle.endsWith("w"), top = d.handle.startsWith("n");
      const x = left ? Math.max(0, Math.min(b.x + b.width - 1, b.x + dx)) : b.x;
      const y = top ? Math.max(0, Math.min(b.y + b.height - 1, b.y + dy)) : b.y;
      updateBox(d.slotIdx, d.part, { x, y, width: left ? b.x + b.width - x : Math.max(1, b.width + dx), height: top ? b.y + b.height - y : Math.max(1, b.height + dy) }, d.key);
    }
  };
  const zoom = (factor: number) => setViewport(v => zoomAt(v, factor, { x: containerWidth / 2, y: containerWidth * size.height / size.width / 2 }));
  return <div className="stack" style={{ gap: 8 }}>
    <div className="preview-toggle">
      <button type="button" className="chip" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
      <span aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
      <button type="button" className="chip" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
      <button type="button" className="chip" onClick={() => setViewport(DEFAULT_VIEWPORT)}>Fit template</button>
      <span className="muted small">Wheel or pinch to zoom. Space + drag to pan. Select a box, then use arrows (Shift: 10 px).</span>
    </div>
    <div ref={containerRef} className="canvas" tabIndex={0} role="region" aria-label="Template layout canvas"
      style={{ position: "relative", padding: 0, width: "100%", aspectRatio: `${size.width} / ${size.height}`, outline: focused ? "2px solid #0ea5e9" : undefined, overflow: "hidden", touchAction: "none" }}
      onPointerDown={event => {
        containerRef.current?.focus();
        containerRef.current?.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, localPoint(event));
        if (space.current) { drag.current = null; pan.current = localPoint(event); }
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y); drag.current = null;
        }
      }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onGestureActive?.(false); space.current = false; nudgeKey.current = null; }}
      onKeyDown={event => {
        if (event.key === " ") { event.preventDefault(); space.current = true; }
        if (renumbering || event.ctrlKey || event.metaKey || selectedSlot == null || !slots[selectedSlot]) return;
        const next = nudgeBox(slots[selectedSlot][selectedPart], event.key, event.shiftKey, size);
        if (next) {
          event.preventDefault();
          nudgeKey.current ??= `nudge-${crypto.randomUUID()}`;
          onGestureActive?.(true);
          updateBox(selectedSlot, selectedPart, next, nudgeKey.current);
        }
      }} onKeyUp={event => { if (event.key === " ") space.current = false; if (event.key.startsWith("Arrow")) { nudgeKey.current = null; onGestureActive?.(false); } }}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} style={{ display: "block", width: "100%", height: "100%" }}>
        <g transform={`translate(${viewport.panX / baseScale} ${viewport.panY / baseScale}) scale(${viewport.zoom})`}>
          {backgroundUrl && <image href={backgroundUrl} width={size.width} height={size.height} style={{ pointerEvents: "none" }} />}
          {rawDebug && ([ ["mugshot", rawDebug.mugshots], ["baby_photo", rawDebug.baby_photos], ["name", rawDebug.names], ["quote", rawDebug.quotes] ] as [SlotBoxKind, Box[]][]).flatMap(([part, boxes]) => boxes.map((box, i) => <rect key={`raw-${part}-${i}`} {...box} data-detected={part} fill="none" stroke={COLORS[part]} strokeWidth={strokeWidthImagePx(scale, 3)} strokeDasharray={`${6 / scale} ${4 / scale}`} style={{ pointerEvents: "none" }} />))}
          {slots.map((slot, i) => <g key={i}>
            {PARTS.map(part => {
              const box = slot[part], active = selectedSlot === i && selectedPart === part && !renumbering;
              return <g key={part}>
                <rect {...box} data-label={`${part}-${i + 1}`} fill={selectedSlot === i ? "rgba(14,165,233,0.14)" : "rgba(15,23,42,0.06)"} stroke={active ? "#0ea5e9" : COLORS[part]} strokeWidth={strokeWidthImagePx(scale)} cursor={renumbering ? "pointer" : "move"} onPointerDown={event => begin(event, i, part)} />
                {active && (["nw", "ne", "sw", "se"] as Handle[]).map(handle => <circle key={handle} data-handle={handle} cx={box.x + (handle.endsWith("e") ? box.width : 0)} cy={box.y + (handle.startsWith("s") ? box.height : 0)} r={handleRadiusImagePx(scale)} fill="#0ea5e9" stroke="#0f172a" strokeWidth={strokeWidthImagePx(scale, 1.5)} cursor={`${handle}-resize`} onPointerDown={event => begin(event, i, part, handle)} />)}
              </g>;
            })}
            <text x={slot.mugshot.x + 8 / scale} y={slot.mugshot.y + 22 / scale} fontSize={18 / scale} fontWeight="bold" fill="white" stroke="#0f172a" strokeWidth={0.5 / scale} style={{ pointerEvents: "none" }}>{slotNumbers?.[i] ?? i + 1}{renumberClicks.includes(i) ? ` (${renumberClicks.indexOf(i) + 1})` : ""}</text>
          </g>)}
        </g>
      </svg>
    </div>
  </div>;
}
