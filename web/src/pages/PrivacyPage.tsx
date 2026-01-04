import { withBase } from "../baseUrl";

export function PrivacyPage() {
  return (
    <main className="ss-page document-page">
      <section className="ss-cover simple-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Privacy Policy</h1>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner document-content">
          <article className="document-article">
            <h2>Privacy Policy</h2>
            <p>
              <em>Effective Date: December 25, 2025</em>
            </p>
            <p>
              This Privacy Policy explains how your information is handled by the Yearbook Grad Mugshot Automator software
              ("the Software").
            </p>

            <h3>1. Local and Hosted Use</h3>
            <ul>
              <li>
                When run on your own computer, the Software is local-first: all data you upload, process, or generate
                (including images, spreadsheets, and templates) remains on your device unless you choose to share or upload
                it elsewhere.
              </li>
              <li>
                In local use, your browser may communicate with the local backend service over HTTP (typically
                <code>http://127.0.0.1:8000</code>) in order to process files, but those requests do not leave your machine.
              </li>
              <li>
                In the future, the Software may be offered as a hosted service. When using a hosted version, your data will
                be transmitted to and processed on the server. Data you upload or generate will be accessible to the server
                operator for the duration of your session or workspace.
              </li>
            </ul>

            <h3>2. Data Collection and Retention</h3>
            <ul>
              <li>
                The Software does <strong>not</strong> collect, transmit, or store any personal data to the developer or any
                third party by default when run locally.
              </li>
              <li>No analytics, telemetry, or background network communication is performed in local mode.</li>
              <li>
                When using a hosted version, your data (including images, spreadsheets, and generated outputs) will be
                stored on the server only as long as your workspace or session is active. Data will be deleted from the
                server after you leave the workspace or end your session.
              </li>
            </ul>

            <h4>Local files and cleanup</h4>
            <ul>
              <li>
                In local mode, the Software stores working files on disk under a per-workspace folder (for example:
                extracted images, uploaded ZIPs/spreadsheets, generated outputs).
              </li>
              <li>
                The Software may automatically clean up old workspaces (depending on configuration). If you want to remove
                data manually, delete the workspace folder on disk.
              </li>
            </ul>

            <h3>3. User Responsibility</h3>
            <ul>
              <li>You are responsible for safeguarding the data you use with the Software.</li>
              <li>
                If you deploy or modify the Software to run on a server or in a shared environment, you are responsible for
                informing users and complying with applicable privacy laws.
              </li>
            </ul>

            <h3>4. Commercial Use</h3>
            <ul>
              <li>
                Commercial licensees may receive support, which may involve sharing diagnostic information or files at your
                discretion. Any such data shared for support purposes will be used only to resolve your issue and will not
                be retained longer than necessary.
              </li>
            </ul>

            <h3>5. Changes to This Policy</h3>
            <ul>
              <li>
                This Privacy Policy may be updated from time to time. Updates will be provided with new releases of the
                Software or posted on the hosted service.
              </li>
            </ul>

            <h3>6. Contact</h3>
            <ul>
              <li>
                For questions about this Privacy Policy or commercial licensing, contact:{" "}
                <a href="mailto:your-contact@domain.com">your-contact@domain.com</a>
              </li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
