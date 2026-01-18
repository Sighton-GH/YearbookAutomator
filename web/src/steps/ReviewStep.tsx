import type React from "react";
import { useState } from "react";
import { clsx } from "clsx";
import { assetUrl, babyMaskUrl, type Box, type PersonRecord } from "../api";

export function ReviewStep({
  people,
  workspaceId,
  babyMaskBox,
  defaultBabyFilename,
  defaultQuoteFallback,
  defaultQuoteAssignments,
  defaultMugshotAssignments,
  swapMode,
  swapDisabled,
  onToggleSwapMode,
  perSpread,
  onSwapPositions,
}: {
  people: PersonRecord[];
  workspaceId: string | null;
  babyMaskBox: Box | null;
  defaultBabyFilename: string | null;
  defaultQuoteFallback: string;
  defaultQuoteAssignments: Record<number, string>;
  defaultMugshotAssignments: Record<number, string>;
  swapMode: boolean;
  swapDisabled: boolean;
  onToggleSwapMode: () => void;
  perSpread: number;
  onSwapPositions: (a: number, b: number) => void;
}) {
  const maskUrl = workspaceId && babyMaskBox ? babyMaskUrl(workspaceId, babyMaskBox) : null;
  const cropAspect = babyMaskBox ? babyMaskBox.width / Math.max(1, babyMaskBox.height) : 1;

  const thumbSizeForAspect = (maxSize: number, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
    if (aspect >= 1) return { width: maxSize, height: Math.max(1, Math.round(maxSize / aspect)) };
    return { width: Math.max(1, Math.round(maxSize * aspect)), height: maxSize };
  };
  const babyThumbDims = thumbSizeForAspect(96, cropAspect);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDrop = (targetIdx: number, evt: React.DragEvent<HTMLDivElement>) => {
    if (!swapMode) return;
    evt.preventDefault();
    const payload = evt.dataTransfer.getData("text/plain");
    const sourceIdx = dragIdx ?? Number(payload);
    if (Number.isNaN(sourceIdx) || sourceIdx == null || sourceIdx === targetIdx) {
      setDropTarget(null);
      setDragIdx(null);
      return;
    }
    onSwapPositions(sourceIdx, targetIdx);
    setDropTarget(null);
    setDragIdx(null);
  };

  return (
    <div className="stack">
      <div className="inline">
        <p className="muted">People grid (includes defaults for baby photo and quote).</p>
        <button
          type="button"
          className={clsx("chip", { active: swapMode })}
          onClick={onToggleSwapMode}
          disabled={swapDisabled}
        >
          {swapMode ? "Swap mode: on" : "Swap mode: off"}
        </button>
      </div>

      {swapDisabled && <p className="muted small">Disable “Force alphabetical” to reorder cards.</p>}
      {swapMode && <p className="muted small">Drag a person card onto another to swap positions.</p>}
      <div className="people-grid">
        {people.map((p, rowIdx) => {
          const positionInSpread = rowIdx % perSpread;
          const spreadNumber = Math.floor(rowIdx / perSpread) + 1;
          const slotNumber = positionInSpread + 1;
          const babyFilename = p.baby_photo_filename || defaultBabyFilename;
          const quote = (p.quote ?? defaultQuoteAssignments[p.index] ?? defaultQuoteFallback ?? "").trim();
          const assignedDefaultMugshot = defaultMugshotAssignments[p.index];
          const babyThumbStyle: React.CSSProperties | undefined = maskUrl
            ? ({
                ["--baby-mask" as never]: `url(${maskUrl})`,
                width: babyThumbDims.width,
                height: babyThumbDims.height,
                minWidth: babyThumbDims.width,
                minHeight: babyThumbDims.height,
              } as React.CSSProperties)
            : undefined;

          const cardClasses = clsx("people-card", {
            "swap-mode": swapMode,
            dragging: dragIdx === rowIdx,
            "swap-target": dropTarget === p.index && swapMode,
          });

          return (
            <div
              className={cardClasses}
              key={p.index}
              draggable={swapMode}
              onDragStart={(evt) => {
                if (!swapMode) return;
                setDragIdx(rowIdx);
                evt.dataTransfer.effectAllowed = "move";
                evt.dataTransfer.setData("text/plain", String(rowIdx));
              }}
              onDragOver={(evt) => {
                if (!swapMode) return;
                evt.preventDefault();
                setDropTarget(p.index);
              }}
              onDragLeave={() => swapMode && setDropTarget(null)}
              onDrop={(evt) => handleDrop(rowIdx, evt)}
            >
              <div className="people-card-header">
                <div className="stack" style={{ gap: 4 }}>
                  <div className="muted small">#{p.index}</div>
                  <div>
                    <strong>
                      {p.first_name} {p.last_name}
                    </strong>
                  </div>
                  <div className="muted small">Spread {spreadNumber} • Slot {slotNumber}</div>
                </div>
              </div>

              <div className="grid two">
                <div className="stack" style={{ gap: 6 }}>
                  <div className="muted small">Mugshot</div>
                  <div className="thumb-cell">
                    {p.mugshot_filename && workspaceId ? (
                      <img
                        src={assetUrl(workspaceId, "mugshot", p.mugshot_filename)}
                        alt="portrait"
                        className="thumb"
                      />
                    ) : assignedDefaultMugshot && workspaceId ? (
                      <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                        <img
                          src={assetUrl(workspaceId, "mugshot", assignedDefaultMugshot)}
                          alt="default portrait"
                          className="thumb"
                        />
                        <div className="muted small">(default)</div>
                      </div>
                    ) : (
                      <div className="muted small">(missing)</div>
                    )}
                  </div>
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <div className="muted small">Baby photo</div>
                  <div className="thumb-cell">
                    {workspaceId && babyFilename ? (
                      <div
                        className={clsx("baby-thumb-editable", "baby-thumb-readonly", "baby-thumb-review", {
                          "baby-thumb-masked": Boolean(maskUrl),
                        })}
                        style={babyThumbStyle}
                      >
                        <img src={assetUrl(workspaceId, "baby", babyFilename)} alt="baby" className="baby-thumb-img" />
                      </div>
                    ) : (
                      <div className="muted small">(default/none)</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="stack" style={{ gap: 6 }}>
                <div className="muted small">Quote</div>
                <div className={clsx({ muted: !p.quote })}>{quote || "(none)"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
