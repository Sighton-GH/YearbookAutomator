import { Link } from "react-router-dom";
import { withBase } from "../baseUrl";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="ss-footer">
      <div className="ss-footer-inner">
        <div className="ss-footer-left">
          <div className="ss-footer-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={withBase("assets/Sighton_Logo.png")}
              alt="Sighton logo"
              style={{ width: 28, height: 28, objectFit: "contain" }}
            />
            <span>Sighton Yearbook Tools</span>
          </div>
          <div className="ss-footer-meta">© {year} Sighton Yearbook Tools</div>
        </div>

        <nav className="ss-footer-nav" aria-label="Footer">
          <Link to="/privacy" className="ss-footer-link">
            Privacy
          </Link>
          <Link to="/license" className="ss-footer-link">
            License
          </Link>
        </nav>
      </div>
    </footer>
  );
}
