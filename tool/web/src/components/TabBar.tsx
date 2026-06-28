import type { ReactNode } from "react";
import { clsx } from "clsx";

export type TabBarItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  index?: number;
  disabled?: boolean;
  disabledReason?: string;
};

export function TabBar<T extends string>({
  items,
  active,
  onSelect,
  size = "default",
  ariaLabel,
  className,
}: {
  items: TabBarItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  size?: "default" | "small";
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={clsx("tab-bar", { "tab-bar-small": size === "small" }, className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          disabled={item.disabled}
          title={item.disabled ? item.disabledReason : undefined}
          className={clsx("tab-bar-item", { active: active === item.id })}
          onClick={() => onSelect(item.id)}
        >
          {typeof item.index === "number" && <span className="tab-bar-item-index">{item.index}</span>}
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
