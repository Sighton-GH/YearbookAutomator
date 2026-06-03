import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { withBase } from "../baseUrl";
import { getStoredLicenseKey, setStoredLicenseKey, validateLicenseKey } from "../licensing";

export function SiteTopBar() {
  const location = useLocation();
  const inTool = location.pathname === "/app";

  const [menuOpen, setMenuOpen] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseValidating, setLicenseValidating] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const [licenseSuccess, setLicenseSuccess] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!showLicenseModal) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (modalRef.current && !modalRef.current.contains(target)) {
        setShowLicenseModal(false);
        setLicenseKeyInput("");
        setLicenseError("");
        setLicenseSuccess(false);
      }
    };

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLicenseModal(false);
        setLicenseKeyInput("");
        setLicenseError("");
        setLicenseSuccess(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [showLicenseModal]);

  function openLicenseModal() {
    const currentKey = getStoredLicenseKey();
    setLicenseKeyInput(currentKey || "");
    setLicenseError("");
    setLicenseSuccess(false);
    setShowLicenseModal(true);
    setMenuOpen(false);
  }

  async function handleSaveLicenseKey() {
    const trimmed = licenseKeyInput.trim();
    if (!trimmed) {
      setLicenseError("Please enter a license key");
      return;
    }

    setLicenseValidating(true);
    setLicenseError("");
    setLicenseSuccess(false);

    try {
      const result = await validateLicenseKey(trimmed);
      if (result.valid) {
        setStoredLicenseKey(trimmed);
        setLicenseSuccess(true);
        setLicenseError("");
        setTimeout(() => {
          setShowLicenseModal(false);
          setLicenseKeyInput("");
          setLicenseSuccess(false);
          // Trigger a page refresh to apply the new license
          window.location.reload();
        }, 1500);
      } else {
        setLicenseError(result.reason || "Invalid license key");
        setLicenseSuccess(false);
      }
    } catch (err) {
      setLicenseError("Failed to validate license key");
      setLicenseSuccess(false);
    } finally {
      setLicenseValidating(false);
    }
  }

  return (
    <header className="ss-topbar">
      <div className="ss-topbar-inner">
        <NavLink
          to="/"
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
                  onClick={openLicenseModal}
                  role="menuitem"
                >
                  Enter License Key
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

      {showLicenseModal && (
        <div className="modal-backdrop">
          <div className="modal-content" ref={modalRef}>
            <h2>Enter License Key</h2>
            <p>Enter your license key to activate the application.</p>
            <div style={{ marginTop: "1rem" }}>
              <label htmlFor="license-key-input" style={{ display: "block", marginBottom: "0.5rem" }}>
                License Key:
              </label>
              <input
                id="license-key-input"
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !licenseValidating) {
                    void handleSaveLicenseKey();
                  }
                }}
                placeholder="Enter your license key"
                style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
                autoFocus
              />
            </div>
            {licenseError && (
              <div style={{ marginTop: "1rem", color: "#d32f2f", fontSize: "0.9rem" }}>
                {licenseError}
              </div>
            )}
            {licenseSuccess && (
              <div style={{ marginTop: "1rem", color: "#2e7d32", fontSize: "0.9rem" }}>
                ✓ License key validated successfully! Reloading...
              </div>
            )}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowLicenseModal(false);
                  setLicenseKeyInput("");
                  setLicenseError("");
                  setLicenseSuccess(false);
                }}
                disabled={licenseValidating}
                style={{ padding: "0.5rem 1rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLicenseKey}
                disabled={licenseValidating || !licenseKeyInput.trim()}
                style={{ padding: "0.5rem 1rem", fontWeight: "bold" }}
              >
                {licenseValidating ? "Validating..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
