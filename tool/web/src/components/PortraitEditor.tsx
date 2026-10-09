import { useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import type { PhotoFocus } from "../photoSettings";
import { PhotoCropper } from "./PhotoCropper";
import { useDialogFocus } from "../utils/dialogFocus";
export function PortraitEditor({ src, aspect, focus, onApply, onClose }: {
  src: string; aspect: number; focus?: PhotoFocus | null;
  onApply: (focus: PhotoFocus | null) => void; onClose: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(focus?.zoom ?? 1);
  const [area, setArea] = useState<Area | null>(null);
  const [initial, setInitial] = useState<Area | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.max(aspect / img.naturalWidth, 1 / img.naturalHeight) * (focus?.zoom ?? 1);
      const width = 100 * aspect / (scale * img.naturalWidth);
      const height = 100 / (scale * img.naturalHeight);
      setInitial({ x: Math.max(0, Math.min(100 - width, (focus?.x ?? 0.5) * 100 - width / 2)),
        y: Math.max(0, Math.min(100 - height, (focus?.y ?? 0.5) * 100 - height / 2)), width, height });
      setLoaded(true);
    };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, aspect, focus]);
  return <div className="modal-backdrop"><div className="modal" ref={dialogRef} style={{ padding: 20, maxHeight: "90vh", overflow: "auto" }} role="dialog" aria-modal="true" aria-label="Adjust portrait"
    onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
    <h3>Adjust portrait</h3><p>Drag the portrait to position the crop. The original photo is kept. Crop applies with Fill the box.</p>
    {failed && <p role="alert">Couldn't load this portrait. Close the editor and try again.</p>}
    <div style={{ position: "relative", width: "100%", height: 400 }}>
      {loaded && <PhotoCropper image={src} aspect={aspect} crop={crop} zoom={zoom} minZoom={1} maxZoom={4}
        initialCroppedAreaPercentages={initial ?? undefined} onCropChange={setCrop} onZoomChange={setZoom}
        onCropComplete={a => setArea(a)} />}
    </div>
    <label className="field"><span>Zoom</span><input type="range" min={1} max={4} step={0.01}
      value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
    <button type="button" disabled={!area} onClick={() => { if (area) onApply({
      x: (area.x + area.width / 2) / 100, y: (area.y + area.height / 2) / 100, zoom }); }}>Apply crop</button>
    <button type="button" onClick={() => onApply(null)}>Reset crop</button>
    <button type="button" onClick={onClose}>Cancel</button>
  </div></div>;
}
