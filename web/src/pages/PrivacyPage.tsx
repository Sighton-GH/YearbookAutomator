export function PrivacyPage() {
  return (
    <main className="ss-page">
      <section className="ss-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Privacy Policy</h1>
          <p className="ss-cover-subtitle">Local-first by default. No telemetry in local mode.</p>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner">
          <div className="panel">
            <h2>Summary</h2>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <strong>Local mode:</strong> Your images/spreadsheets/templates stay on your computer.
              </li>
              <li>
                <strong>No analytics/telemetry:</strong> The app does not send usage data in local mode.
              </li>
              <li>
                <strong>Hosted mode (future):</strong> If you run it on a server, files will be processed/stored there for the duration of your session/workspace.
              </li>
            </ul>

            <p className="muted" style={{ marginTop: 12 }}>
              Full policy: <a href="/PRIVACY.md">/PRIVACY.md</a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
