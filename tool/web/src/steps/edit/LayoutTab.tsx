import { useState } from "react";
import { clsx } from "clsx";
import { LayoutGrid } from "lucide-react";
import type { Box, RawParseDebug, TemplateSlots } from "../../api";
import { TemplatePreview } from "../../components/TemplatePreview";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Inspector } from "../../components/Inspector";
import { SlotInspectorFields } from "../../components/SlotInspectorFields";
import { groupSlotsByProximity } from "../../utils/slots";

export function LayoutTab({
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
}) {
  const selected = selectedSlot != null ? slots[selectedSlot] : null;
  const [regroupConfirm, setRegroupConfirm] = useState<TemplateSlots[] | null>(null);

  const requestRegroup = () => {
    const regrouped = groupSlotsByProximity(slots, peoplePerSpread);
    if (regrouped.length < slots.length) {
      setRegroupConfirm(regrouped);
      return;
    }
    onSlots(regrouped);
  };
  const regroupMessage = regroupConfirm
    ? `Regrouping keeps ${regroupConfirm.length} slots and removes ${slots.length - regroupConfirm.length}. Continue?`
    : undefined;

  return (
    <div className="layout-with-inspector">
      <div className="stack" style={{ gap: 12 }}>
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
            onClick={requestRegroup}
            disabled={!slots.length}
          >
            Regroup nearby slots
          </button>
        </div>

        <ConfirmDialog
          open={Boolean(regroupConfirm)}
          title="Regroup nearby slots?"
          message={regroupMessage}
          confirmLabel="Continue"
          cancelLabel="Cancel"
          onCancel={() => setRegroupConfirm(null)}
          onConfirm={() => {
            if (regroupConfirm) onSlots(regroupConfirm);
            setRegroupConfirm(null);
          }}
        />

        <TemplatePreview
          slots={slots}
          size={templateSize}
          onUpdate={onSlots}
          backgroundUrl={
            previewMode === "annotated" ? annotatedPreviewUrl ?? templatePreviewUrl : cleanPreviewUrl ?? templatePreviewUrl
          }
          selectedSlot={selectedSlot}
          onSelectSlot={(idx) => onSelectedSlot(idx)}
        />

        {rawDebug && (
          <details className="debug-section">
            <summary className="muted small">
              Debug: {rawDebug.mugshot_count} portraits, {rawDebug.baby_count} baby, {rawDebug.name_count} names, {rawDebug.quote_count} quotes
            </summary>
            <div className="debug-actions">
              <button
                type="button"
                className="chip small"
                onClick={() => {
                  const formatBoxes = (label: string, boxes: Box[]) =>
                    boxes.map((b, i) => `${label} ${i + 1}: x=${b.x}, y=${b.y}, w=${b.width}, h=${b.height}`).join("\n");
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
                Copy raw debug
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
                Copy slot coords
              </button>
            </div>
          </details>
        )}
      </div>

      <Inspector
        title={selected ? `Slot ${selectedSlot! + 1}` : undefined}
        subtitle={selected ? `${selected.mugshot.width}×${selected.mugshot.height} @ (${selected.mugshot.x}, ${selected.mugshot.y})` : undefined}
        onClose={selected ? () => onSelectedSlot(null) : undefined}
        empty={!selected}
        emptyIcon={<LayoutGrid size={28} />}
        emptyTitle="No slot selected"
        emptyHint="Click a slot box in the canvas to fine-tune its portrait, baby, name, and quote regions."
      >
        {selected && (
          <>
            <SlotInspectorFields
              slot={selected}
              templateSize={templateSize}
              onChange={(next) => {
                const copy = slots.map((s, i) => (i === selectedSlot ? next : s));
                onSlots(copy);
              }}
            />
            {parsedSlots.length > 0 && (
              <button
                type="button"
                className="chip small danger"
                onClick={() => {
                  const parsed = parsedSlots[selectedSlot!];
                  if (!parsed) return;
                  const copy = slots.map((s, i) => (i === selectedSlot ? { ...parsed } : s));
                  onSlots(copy);
                }}
              >
                Reset this slot to parsed
              </button>
            )}
          </>
        )}
      </Inspector>
    </div>
  );
}
