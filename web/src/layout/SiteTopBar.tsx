import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

export function SiteTopBar() {
  const location = useLocation();
  const inTool = location.pathname === "/tool";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  function triggerToolAction(kind: "save" | "upload") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(kind === "save" ? "ymga:save-config" : "ymga:upload-config"));
    setMenuOpen(false);
  }

  return (
    <header className="ss-topbar">
      <div className="ss-topbar-inner">
        <NavLink to="/" className="ss-brand" aria-label="Sylit Yearbook Tools">
          <span className="ss-brand-main">Sylit Yearbook Tools</span>
          <span className="ss-brand-sub">Custom Yearbook Spread Automator</span>
        </NavLink>

        <div className="ss-topbar-right">
          <nav className="ss-nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
            >
              About
            </NavLink>
            <NavLink
              to="/tool"
              className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
            >
              Tool
            </NavLink>
            <NavLink
              to="/how-to-use"
              className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
            >
              Documentation
            </NavLink>
            <NavLink
              to="/pricing"
              className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
            >
              Pricing
            </NavLink>
          </nav>

          <div className="popover-anchor" ref={menuRef}>
            <button
              type="button"
              className="ss-menu-btn"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>

            {menuOpen && (
              <div className="popover below ss-menu" role="menu" aria-label="Menu">
                <button
                  type="button"
                  className="ss-menu-item"
                  onClick={() => triggerToolAction("save")}
                  disabled={!inTool}
                  role="menuitem"
                >
                  Save config
                </button>
                <button
                  type="button"
                  className="ss-menu-item"
                  onClick={() => triggerToolAction("upload")}
                  disabled={!inTool}
                  role="menuitem"
                >
                  Upload config
                </button>

                <div className="ss-menu-sep" role="separator" />

                <NavLink to="/privacy" className="ss-menu-link" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Privacy policy
                </NavLink>
                <NavLink to="/license" className="ss-menu-link" role="menuitem" onClick={() => setMenuOpen(false)}>
                  License
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
