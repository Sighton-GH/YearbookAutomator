import { clsx } from "clsx";
import type { Box, RawParseDebug, TemplateSlots } from "../api";
import { InfoPopover } from "../components/InfoPopover";
import { TemplatePreview } from "../components/TemplatePreview";
import { SlotEditor } from "../components/SlotEditor";
import { groupSlotsByProximity } from "../utils/slots";

export function ParsingReview({
  slots,
  templateSize,
  onSlots,
  previewMode,
  onPreviewMode,
  annotatedPreviewUrl,
  cleanPreviewUrl,
  templatePreviewUrl,
  selectedSlot,
  onSelectedSlot,
  peoplePerSpread,
  parsedSlots,
  rawDebug,
  loading,
  onBack,
  onReset,
  onContinue,
}: {
  slots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
  onSlots: (slots: TemplateSlots[]) => void;
  previewMode: "clean" | "annotated";
  onPreviewMode: (mode: "clean" | "annotated") => void;
  annotatedPreviewUrl: string | null;
  cleanPreviewUrl: string | null;
  templatePreviewUrl: string | null;
  selectedSlot: number | null;
  onSelectedSlot: (idx: number | null) => void;
  peoplePerSpread: number;
  parsedSlots: TemplateSlots[];
  rawDebug: RawParseDebug | null;
  loading: boolean;
  onBack: () => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="panel preview full-preview">
      <div className="section-header">
        <div className="stack">
          <div className="inline" style={{ alignItems: "center", gap: 6 }}>
            <h3>Parsing review</h3>
            <InfoPopover
              content="Review detected slots. Drag to tweak boxes, regroup, then continue."
              ariaLabel="Parsing review description"
              position="below"
            />
          </div>
        </div>
        <div className="section-actions">
          <button onClick={onBack}>Back</button>
          <button type="button" className="danger" onClick={onReset} disabled={loading}>
            Reset all
          </button>
          <button className="primary" disabled={!slots.length || loading} onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
      <div className="preview-grid">
        <div className="preview-left">
          <TemplatePreview
            slots={slots}
            size={templateSize}
            onUpdate={onSlots}
            backgroundUrl={
              previewMode === "annotated"
                ? annotatedPreviewUrl ?? templatePreviewUrl
                : cleanPreviewUrl ?? templatePreviewUrl
            }
            selectedSlot={selectedSlot}
            onSelectSlot={(idx) => onSelectedSlot(idx)}
          />
          <div className="preview-toggle">
            <button
              type="button"
              className={clsx("chip", { active: previewMode === "clean" })}
              onClick={() => onPreviewMode("clean")}
              disabled={!cleanPreviewUrl && !templatePreviewUrl}
            >
              Show clean template
            </button>
            <button
              type="button"
              className={clsx("chip", { active: previewMode === "annotated" })}
              onClick={() => onPreviewMode("annotated")}
              disabled={!annotatedPreviewUrl && !templatePreviewUrl}
            >
              Show annotated template
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => onSlots(groupSlotsByProximity(slots, peoplePerSpread))}
              disabled={!slots.length}
            >
              Regroup nearby slots
            </button>
          </div>
        </div>
        <div className="preview-right">
          <SlotEditor
            slots={slots}
            onChange={onSlots}
            onSelectSlot={(idx) => onSelectedSlot(idx)}
            selectedSlot={selectedSlot}
            parsedSlots={parsedSlots}
            onResetToParsed={() => onSlots(parsedSlots.map((s) => ({ ...s })))}
          />
        </div>
      </div>
      {rawDebug && (
        <div className="debug-section">
          <details>
            <summary className="muted small">
              Debug: {rawDebug.mugshot_count} portraits, {rawDebug.baby_count} baby, {rawDebug.name_count} names, {rawDebug.quote_count} quotes
            </summary>
            <div className="debug-actions">
              <button
                type="button"
                className="chip small"
                onClick={() => {
                  const formatBoxes = (label: string, boxes: Box[]) =>
                    boxes
                      .map((b, i) => `${label} ${i + 1}: x=${b.x}, y=${b.y}, w=${b.width}, h=${b.height}`)
                      .join("\n");
                  const text = [
                    `=== RAW PARSING RESULTS ===`,
                    `Portraits (${rawDebug.mugshot_count}):`,
                    formatBoxes("  Portrait", rawDebug.mugshots),
                    `\nBaby Photos (${rawDebug.baby_count}):`,
                    formatBoxes("  Baby", rawDebug.baby_photos),
                    `\nNames (${rawDebug.name_count}):`,
                    formatBoxes("  Name", rawDebug.names),
                    `\nQuotes (${rawDebug.quote_count}):`,
                    formatBoxes("  Quote", rawDebug.quotes),
                  ].join("\n");
                  navigator.clipboard.writeText(text).catch(console.error);
                }}
              >
                📋 Copy raw debug
              </button>
              <button
                type="button"
                className="chip small"
                onClick={() => {
                  const lines = slots.flatMap((slot, idx) =>
                    (["mugshot", "baby_photo", "name", "quote"] as (keyof TemplateSlots)[]).map((part) => {
                      const box = slot[part];
                      return `Slot ${idx + 1} ${part}: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`;
                    })
                  );
                  navigator.clipboard.writeText(lines.join("\n")).catch(console.error);
                }}
              >
                📋 Copy slot coords
              </button>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
