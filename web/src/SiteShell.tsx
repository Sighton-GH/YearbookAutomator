import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteTopBar } from "./layout/SiteTopBar";
import { SiteFooter } from "./layout/SiteFooter";
import { AboutPage } from "./pages/AboutPage";
import { DocumentationPage } from "./pages/DocumentationPage";
import { LicensePage } from "./pages/LicensePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PricingPage } from "./pages/PricingPage";
import { ToolAppPage } from "./pages/ToolAppPage";
import { ToolPage } from "./pages/ToolPage";

export default function SiteShell() {
  const location = useLocation();
  const inApp = location.pathname === "/app";

  if (inApp) {
    return <ToolAppPage />;
  }

  return (
    <div className="ss-shell">
      <SiteTopBar />
      <main className="ss-main">
        <Routes>
          <Route path="/" element={<AboutPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/how-to-use" element={<DocumentationPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/tool" element={<ToolPage />} />
          <Route path="/license" element={<LicensePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
