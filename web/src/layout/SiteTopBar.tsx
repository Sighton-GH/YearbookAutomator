import { NavLink } from "react-router-dom";

export function SiteTopBar() {
  return (
    <header className="ss-topbar">
      <div className="ss-topbar-inner">
        <NavLink to="/" className="ss-brand" aria-label="Sylit Yearbook Tools">
          <span className="ss-brand-main">Sylit Yearbook Tools</span>
          <span className="ss-brand-sub">Custom Yearbook Spread Automator</span>
        </NavLink>

        <nav className="ss-nav" aria-label="Primary">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
          >
            How To Use
          </NavLink>
          <NavLink
            to="/tool"
            className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
          >
            Tool
          </NavLink>
          <NavLink
            to="/about"
            className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
          >
            About
          </NavLink>
          <NavLink
            to="/pricing"
            className={({ isActive }) => (isActive ? "ss-nav-link active" : "ss-nav-link")}
          >
            Pricing
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
