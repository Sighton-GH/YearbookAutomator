import { withBase } from "../baseUrl";

export function LicensePage() {
  return (
    <main className="ss-page">
      <section className="ss-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">License</h1>
          <p className="ss-cover-subtitle">Free for personal use. Commercial licensing available.</p>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner">
          <div className="panel">
            <h2>Summary</h2>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <strong>Personal, non-commercial:</strong> Free to use (personal keys are limited to <strong>5 uses per month</strong> and reset monthly).
              </li>
              <li>
                <strong>Commercial use:</strong> Requires a paid commercial license.
              </li>
              <li>
                <strong>Redistribution:</strong> Not permitted without explicit written permission.
              </li>
            </ul>

            <p className="muted" style={{ marginTop: 12 }}>
              Full terms: <a href={withBase("LICENSE")}>/LICENSE</a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
