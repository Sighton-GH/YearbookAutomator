const THEME_STORAGE_KEY = "ss-site-theme";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.7 3.3l-1.13 1.13M4.43 11.57L3.3 12.7M12.7 12.7l-1.13-1.13M4.43 4.43L3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.6A6 6 0 016.4 2.5a6 6 0 106.5 6.5 4.6 4.6 0 00.6.6z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeToggle({ isDark, onChange }: { isDark: boolean; onChange: (dark: boolean) => void }) {
  return (
    <button
      type="button"
      className="ss-theme-toggle"
      onClick={() => onChange(!isDark)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

export function getStoredSiteTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function persistSiteTheme(isDark: boolean): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
  } catch {
    // ignore
  }
}
