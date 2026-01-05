import { Children, cloneElement, isValidElement, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
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
  children: ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [fileName, setFileName] = useState<string>("");
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

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
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
    if (!dispatched) {
      setHasFile(true);
      setFileName(firstAccepted.name);
      onFile(firstAccepted);
    }
  };

  const childrenWithInlineTip = useMemo(() => {
    let injected = false;
    const out: ReactNode[] = [];

    for (const child of Children.toArray(children)) {
      if (!injected && isValidElement(child) && child.type === "input") {
        const props: any = child.props;
        if (props?.type === "file") {
          injected = true;

          const existingOnChange = props?.onChange as ((e: any) => void) | undefined;
          const wrappedOnChange = (e: any) => {
            const files = e?.target?.files as FileList | undefined;
            const nextHasFile = Boolean(files && files.length > 0);
            setHasFile(nextHasFile);
            setFileName(nextHasFile ? files?.[0]?.name ?? "" : "");
            existingOnChange?.(e);
          };

          const mergedClassName = clsx(props?.className, "upload-native-input");
          const mergedDisabled = Boolean(disabled || props?.disabled);
          const clonedInput = cloneElement(child as any, {
            onChange: wrappedOnChange,
            className: mergedClassName,
            disabled: mergedDisabled,
          });

          out.push(
            <div key="__upload_file_row" className="upload-file-row">
              {clonedInput}
              <div className="upload-file-ui" aria-hidden="true">
                <button type="button" className="upload-file-button">
                  <svg
                    className="upload-file-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 16V4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7 9L12 4L17 9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 20H20"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Upload File
                </button>
                <span className="upload-file-name">{hasFile ? fileName || "File selected" : "No file chosen"}</span>
                {!hasFile ? <span className="upload-file-tip">(you can also drag and drop a file)</span> : null}
              </div>
            </div>
          );
          continue;
        }
      }

      out.push(child);
    }

    return out;
  }, [children, disabled, fileName, hasFile]);

  return (
    <label
      className={clsx("upload", className, dragOver && "dragover", disabled && "disabled")}
      ref={labelRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {childrenWithInlineTip}
    </label>
  );
}
