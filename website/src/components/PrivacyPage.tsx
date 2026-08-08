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
            <p><em>Effective Date: August 6, 2026</em></p>
            <p>This Privacy Policy explains how Custom Flow Automator (the &ldquo;Service&rdquo;) handles information.</p>

            <h3>1. Hosted Service and Data Location</h3>
            <p>
              Custom Flow Automator is a browser-based hosted service, not a program that runs on your device. The
              application server that processes and stores workspace files is located in Canada. Information travels
              between your browser and the Service over HTTPS (TLS encryption). Cloudflare provides the public network
              edge, security filtering, and an encrypted tunnel to the Canadian origin server; network routing through
              Cloudflare may occur outside Canada.
            </p>

            <h3>2. Information We Process</h3>
            <ul>
              <li><strong>Workspace content:</strong> templates, rosters, student names, portraits, baby photos, quotes, fonts, settings, and generated outputs.</li>
              <li><strong>Service data:</strong> license key, device identifier, IP address, session/workspace events, feature usage, and basic request performance/status records.</li>
              <li>The application does not include advertising trackers and does not sell student data.</li>
            </ul>

            <h3>3. How Information Is Used</h3>
            <p>
              Information is used only to operate the Service, generate requested yearbook files, enforce licensing and
              workspace access, prevent abuse, monitor reliability, and provide support when requested. Authorized server
              administration may require limited access for security, maintenance, recovery, or support.
            </p>

            <h3>4. Storage, Retention, and Deletion</h3>
            <p>
              Workspace content is stored in an access-controlled workspace on the Canadian server. Personal workspaces
              expire after eight hours by default. Commercial retention is configured per license and may be longer or
              have expiry disabled. Ending, resetting, or deleting a workspace schedules or performs deletion; expired
              workspaces are removed automatically. Licensing and security records are retained separately for
              administration, fraud prevention, and audit purposes.
            </p>

            <h3>5. Security</h3>
            <p>
              The Service uses HTTPS, authenticated licenses, device/session controls, isolated workspace identifiers,
              upload validation, request and processing limits, security headers, and restricted server services. No
              internet service can guarantee absolute security. Users should access the Service only through its official
              HTTPS address and report suspected exposure promptly.
            </p>

            <h3>6. Service Providers and Disclosure</h3>
            <p>
              Cloudflare processes network traffic to deliver and protect the Service. Information may also be disclosed
              when required by law or necessary to investigate abuse, protect users, or defend the Service. Student data
              is not sold or shared for advertising.
            </p>

            <h3>7. School and User Responsibilities</h3>
            <p>
              Schools and other users must have authority to upload student information, follow applicable privacy and
              records-management requirements, limit access to license keys, and download or delete outputs when work is complete.
            </p>

            <h3>8. Changes and Contact</h3>
            <p>
              Material changes will be posted with a revised effective date. Questions, deletion requests, and security
              reports may be sent to <a href="mailto:sightonmedia@gmail.com">sightonmedia@gmail.com</a>.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
