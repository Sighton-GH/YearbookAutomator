import { useId } from "react";
import { ArrowRight } from "lucide-react";

/** Each copy of the navigation controls owns a unique description target. */
export function StepContinueButton({ label, reason, onContinue }: {
  label: string;
  reason?: string;
  onContinue: () => void;
}) {
  const reasonId = useId();
  return (
    <div className="step-continue">
      <button
        type="button"
        className="primary"
        aria-disabled={Boolean(reason)}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => { if (!reason) onContinue(); }}
      >
        Continue to {label} <ArrowRight size={15} />
      </button>
      {reason && <p id={reasonId} className="step-missing-reason">{reason}</p>}
    </div>
  );
}
