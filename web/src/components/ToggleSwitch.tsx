import type React from "react";
import { clsx } from "clsx";

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  description,
  className,
  style,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <label className={clsx("switch", className)} style={style}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-ui" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span>{label}</span>
        {description ? <div className="muted small">{description}</div> : null}
      </span>
    </label>
  );
}
