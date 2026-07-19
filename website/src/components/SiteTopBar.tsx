import { useEffect, useRef, useState } from "react";
import { withBase } from "../lib/baseUrl";
import { TOOL_URL } from "../lib/env";
import { ThemeToggle, getStoredSiteTheme, persistSiteTheme } from "./ThemeToggle";

function navLinkClass(currentPath: string, target: string): string {
  return currentPath === target ? "ss-nav-link active" : "ss-nav-link";
}

export function SiteTopBar({ currentPath }: { currentPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Pre-paint script in SiteLayout.astro already set data-theme on <html> before
  // React mounted; read it back here so this button's icon matches on first render.
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  useEffect(() => {
    setIsDark(getStoredSiteTheme() === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    persistSiteTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    };

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="ss-topbar">
      <div className="ss-topbar-inner">
        <a
          href={withBase("/")}
          className="ss-brand"
          aria-label="Sighton Yearbook Tools"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <img
            src={withBase("assets/Sighton_Logo.png")}
            alt="Sighton logo"
            style={{ width: 36, height: 36, objectFit: "contain", display: "block" }}
          />
          <span className="ss-brand-main">Sighton Yearbook Tools</span>
          <span className="ss-brand-sub">Custom Flow Automator</span>
          <span className="ss-beta-badge">Beta</span>
        </a>

        <div className="ss-topbar-right">
          <nav className="ss-nav" aria-label="Primary">
            <a href={withBase("/")} className={navLinkClass(currentPath, "/")}>
              About
            </a>
            <a href={TOOL_URL} className="ss-nav-link">
              Tool
            </a>
            <a href={withBase("how-to-use")} className={navLinkClass(currentPath, "/how-to-use")}>
              Documentation
            </a>
            <a href={withBase("pricing")} className={navLinkClass(currentPath, "/pricing")}>
              Pricing
            </a>
          </nav>

          <ThemeToggle isDark={isDark} onChange={setIsDark} />

          <div className="popover-anchor" ref={menuRef}>
            <button
              type="button"
              className="ss-menu-btn"
              aria-label="More links"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="26" height="26" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="1.5" y="3.2" width="15" height="2.7" rx="1.35" fill="currentColor" />
                <rect x="1.5" y="7.65" width="15" height="2.7" rx="1.35" fill="currentColor" />
                <rect x="1.5" y="12.1" width="15" height="2.7" rx="1.35" fill="currentColor" />
              </svg>
            </button>

            {menuOpen && (
              <div className="popover below ss-menu" role="menu" aria-label="More links">
                <a href={withBase("privacy")} className="ss-menu-link" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Privacy policy
                </a>
                <a href={withBase("license")} className="ss-menu-link" role="menuitem" onClick={() => setMenuOpen(false)}>
                  License
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
