import type React from "react";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { filesFromDataTransfer, matchesAccept } from "../utils/dragDrop";

export function UploadDropLabel({
  accept,
  disabled,
  className,
  onFile,
  children,
}: {
  accept?: string;
  disabled?: boolean;
  className?: string;
  onFile: (file: File) => void;
  children: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const labelRef = useRef<HTMLLabelElement | null>(null);

  const setInputFileAndDispatch = (file: File): boolean => {
    const input = labelRef.current?.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      // In Chromium-based browsers, this is allowed when using a DataTransfer.
      // If it's blocked, we'll fall back to calling onFile directly.
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;

    const files = filesFromDataTransfer(e.dataTransfer);
    const firstAccepted = files.find((f) => matchesAccept(f, accept));
    if (!firstAccepted) return;

    // Prefer updating the underlying file input so the UI shows the filename
    // in the same place as a normal file picker selection.
    const dispatched = setInputFileAndDispatch(firstAccepted);
    if (!dispatched) onFile(firstAccepted);
  };

  return (
    <label
      className={clsx("upload", className, dragOver && "dragover", disabled && "disabled")}
      ref={labelRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      <span className="muted small">You can also drag and drop a file here.</span>
    </label>
  );
}
