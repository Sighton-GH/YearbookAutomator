import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteTopBar } from "./layout/SiteTopBar";
import { SiteFooter } from "./layout/SiteFooter";
import { AboutPage } from "./pages/AboutPage";
import { DocumentationPage } from "./pages/DocumentationPage";
import { LicensePage } from "./pages/LicensePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PricingPage } from "./pages/PricingPage";
import { ToolPage } from "./pages/ToolPage";

export default function SiteShell() {
  const location = useLocation();
  const inTool = location.pathname === "/tool";

  return (
    <div className="ss-shell">
      <SiteTopBar />
      <main className="ss-main">
        {/* Keep Tool mounted so progress/state doesn't reset when navigating. */}
        <div hidden={!inTool}>
          <ToolPage />
        </div>

        <div hidden={inTool}>
          <Routes>
            <Route path="/" element={<AboutPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/how-to-use" element={<DocumentationPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            {/* Tool is rendered above and kept mounted; route exists to prevent catch-all redirect. */}
            <Route path="/tool" element={<></>} />
            <Route path="/license" element={<LicensePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
