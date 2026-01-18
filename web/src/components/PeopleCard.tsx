import type React from "react";
import { clsx } from "clsx";
import { assetUrl, type PersonRecord } from "../api";

export type PeopleCardThumb = {
  label: string;
  kind: "mugshot" | "baby";
  filename?: string | null;
  defaultFilename?: string | null;
  showDefaultLabel?: boolean;
  showMissingLabel?: boolean;
  showEmptyBox?: boolean;
  canShowImage?: boolean;
  className?: string;
  wrapperClassName?: string;
  style?: React.CSSProperties;
  overlayLabel?: string | null;
  onClick?: () => void;
  onError?: () => void;
};

export function PeopleCard({
  person,
  workspaceId,
  className,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  mugshot,
  baby,
  quoteValue,
  onQuoteChange,
  showQuote = true,
  children,
}: {
  person: PersonRecord;
  workspaceId: string | null;
  className?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  mugshot: PeopleCardThumb;
  baby: PeopleCardThumb;
  quoteValue: string;
  onQuoteChange: (next: string) => void;
  showQuote?: boolean;
  children?: React.ReactNode;
}) {
  const renderThumb = (thumb: PeopleCardThumb) => {
    const canShow = thumb.canShowImage ?? true;
    const primary = thumb.filename ?? null;
    const fallback = thumb.defaultFilename ?? null;
    const finalFilename = primary ?? fallback;
    const isDefault = !primary && Boolean(fallback);
    const hasImage = Boolean(workspaceId && finalFilename && canShow);
    const showMissingLabel = thumb.showMissingLabel ?? true;
    const showEmptyBox = thumb.showEmptyBox ?? true;
    const labelText = hasImage
      ? finalFilename
      : (showMissingLabel ? "(missing)" : "");
    const defaultSuffix = isDefault && thumb.showDefaultLabel ? " (default)" : "";
    const filenameLabel = labelText ? `${labelText}${defaultSuffix}` : "";

    return (
      <div className="stack" style={{ gap: 4, alignItems: "center" }}>
        <div className="muted small">{thumb.label}</div>
        <div
          className={clsx("thumb-cell", thumb.wrapperClassName, hasImage && "has-image")}
          style={thumb.style}
        >
          {hasImage ? (
            <img
              src={assetUrl(workspaceId!, thumb.kind, finalFilename!)}
              alt={thumb.label.toLowerCase()}
              className={clsx("thumb", thumb.kind === "baby" && "thumb-baby", thumb.className)}
              onClick={thumb.onClick}
              onError={thumb.onError}
            />
          ) : showEmptyBox ? (
            <div className="thumb-empty" />
          ) : null}
          {thumb.overlayLabel ? <div className="thumb-overlay">{thumb.overlayLabel}</div> : null}
        </div>
        {filenameLabel ? <div className="muted small thumb-filename">{filenameLabel}</div> : null}
      </div>
    );
  };

  return (
    <div
      className={clsx("people-card", className)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="people-card-header">
        <div className="stack" style={{ gap: 4 }}>
          <div className="muted small">#{person.index}</div>
          <div>
            <strong>
              {person.first_name} {person.last_name}
            </strong>
          </div>
        </div>
      </div>

      <div className="people-card-thumbs">
        {renderThumb(mugshot)}
        {renderThumb(baby)}
      </div>

      <div className="people-card-body">
        {showQuote ? (
          <label className="field">
            <span>Quote</span>
            <textarea
              rows={2}
              value={quoteValue}
              onChange={(e) => onQuoteChange(e.target.value)}
              placeholder=""
            />
          </label>
        ) : null}

        {children}
      </div>
    </div>
  );
}
