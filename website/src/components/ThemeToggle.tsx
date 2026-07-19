const THEME_STORAGE_KEY = "ss-site-theme";

const SUN_RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function SunIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.7" fill="currentColor" />
      {SUN_RAY_ANGLES.map((deg) => (
        <rect
          key={deg}
          x="7"
          y="0"
          width="2"
          height="3"
          rx="1"
          fill="currentColor"
          transform={`rotate(${deg} 8 8)`}
        />
      ))}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
