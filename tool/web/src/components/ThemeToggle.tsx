import { Moon, Sun } from "lucide-react";

export function ThemeToggle({
  isDark,
  onChange,
  className,
}: {
  isDark: boolean;
  onChange: (dark: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `theme-toggle-btn ${className}` : "theme-toggle-btn"}
      onClick={() => onChange(!isDark)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
