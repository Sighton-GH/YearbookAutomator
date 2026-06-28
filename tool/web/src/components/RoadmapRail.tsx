import { Fragment } from "react";
import { clsx } from "clsx";
import { Check, Lock } from "lucide-react";

export type RoadmapStatus = "done" | "current" | "upcoming";

export type RoadmapItem<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: React.ReactNode;
  status: RoadmapStatus;
  optional?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

/** Horizontal step bar (icon + label pills joined by connector lines). The full
 *  description for the active step is shown by the canvas header, not here —
 *  keeping the bar to short labels means it never wraps and can never overlap
 *  the content below it. */
export function RoadmapRail<T extends string>({
  items,
  active,
  onSelect,
  ariaLabel = "Steps",
}: {
  items: RoadmapItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <nav className="roadmap-rail" aria-label={ariaLabel}>
      <div className="roadmap-list" role="list">
        {items.map((item, idx) => {
          const isActive = item.id === active;
          const prevDone = idx > 0 && items[idx - 1].status === "done";
          return (
            <Fragment key={item.id}>
              {idx > 0 && (
                <span className={clsx("roadmap-connector", { "is-done": prevDone })} aria-hidden="true" />
              )}
              <div className="roadmap-li" role="listitem">
                <button
                  type="button"
                  className={clsx("roadmap-step", `is-${item.status}`, { "is-active": isActive })}
                  aria-current={isActive ? "step" : undefined}
                  disabled={item.disabled}
                  title={item.disabled ? item.disabledReason : item.description}
                  onClick={() => !item.disabled && onSelect(item.id)}
                >
                  <span className="roadmap-marker" aria-hidden="true">
                    {item.disabled ? (
                      <Lock size={13} />
                    ) : item.status === "done" ? (
                      <Check size={14} strokeWidth={3} />
                    ) : (
                      <span className="roadmap-icon">{item.icon}</span>
                    )}
                  </span>
                  <span className="roadmap-label">
                    {item.label}
                    {item.optional && <span className="roadmap-optional">Optional</span>}
                  </span>
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
