import { withBase } from "../baseUrl";

export function PricingPage() {
  return (
    <main className="ss-page">
      <section className="ss-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Pricing</h1>
          <p className="ss-cover-subtitle">Free for personal, non-commercial use. Commercial licensing available.</p>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner">
          <div className="panel">
            <h2>Personal (non-commercial) use</h2>
            <p className="muted">
              This app is free to use for personal, non-commercial purposes.
            </p>
            <p className="muted">
              Personal keys are limited to <strong>5 uses per month</strong> (resets monthly). If you need more usage,
              you’ll need a commercial license.
            </p>

            <h2>Commercial use</h2>
            <p className="muted">
              Commercial use requires a paid commercial license. To obtain one, contact: <a href="mailto:your-contact@domain.com">your-contact@domain.com</a>
            </p>

            <p className="muted" style={{ marginTop: 12 }}>
              See <a href={withBase("license")}>License</a> for full terms.
            </p>

            <div className="inline" style={{ marginTop: 12 }}>
              <a href={withBase("tool")}>Open the Tool</a>
              <a href={withBase("how-to-use")}>Read How To Use</a>
              <a href={withBase("about")}>About</a>
              <a href={withBase("license")}>License</a>
              <a href={withBase("privacy")}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
