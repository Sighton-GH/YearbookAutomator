import type React from "react";

export function openWarningsDetails(
  detailsRef: React.RefObject<HTMLDetailsElement | null>,
  setOpen: (open: boolean) => void
) {
  setOpen(true);
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 0);
}

export function CompletionServerMessageWithWarningsLink({
  completedErrorCount,
  baseMessage,
  detailsRef,
  setDetailsOpen,
}: {
  completedErrorCount: number | null;
  baseMessage: string;
  detailsRef: React.RefObject<HTMLDetailsElement | null>;
  setDetailsOpen: (open: boolean) => void;
}) {
  if (completedErrorCount === null) return null;

  return (
    <p className="muted prewrap">
      {"Server Message: \n"}
      {completedErrorCount > 0 ? (
        <>
          {baseMessage} with {completedErrorCount} errors. Please review the errors{" "}
          <button
            type="button"
            className="inline-link"
            onClick={() => openWarningsDetails(detailsRef, setDetailsOpen)}
          >
            here
          </button>
          .
        </>
      ) : (
        <>{baseMessage}.</>
      )}
    </p>
  );
}
