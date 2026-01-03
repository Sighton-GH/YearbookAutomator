import { Link } from "react-router-dom";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="ss-footer">
      <div className="ss-footer-inner">
        <div className="ss-footer-left">
          <div className="ss-footer-brand">Sylit Yearbook Tools</div>
          <div className="ss-footer-meta">© {year} Sylit Yearbook Tools</div>
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
