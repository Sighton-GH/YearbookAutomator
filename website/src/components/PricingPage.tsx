import { TOOL_URL } from "../lib/env";

const CONTACT_EMAIL = "sightonmedia@gmail.com";

export function PricingPage() {
  return (
    <main className="ss-page pricing-page">
      <section className="ss-cover pricing-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Pricing</h1>
          <p className="ss-cover-subtitle">
            Free for personal projects. Licensed for schools and businesses, priced to fit the
            organization — that&rsquo;s why there&rsquo;s no number on this page.
          </p>
        </div>
      </section>

      <section className="ss-content pricing-content">
        <div className="ss-content-inner">
          <div className="pricing-grid">
            <div className="pricing-card personal-card">
              <div className="pricing-header">
                <h3 className="pricing-title">Personal</h3>
                <p className="pricing-description">For individual, non-commercial projects</p>
              </div>

              <div className="pricing-badge">Free</div>

              <div className="pricing-features">
                <ul className="feature-list">
                  <li>
                    <span className="check-icon" />
                    <span><strong>5 generation runs per month</strong>, reset on the 1st</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Every feature — nothing is held back from the free tier</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Local processing; your data stays on your device</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Independent workspace per device, 8-hour sessions</span>
                  </li>
                </ul>
              </div>

              <p className="pricing-note">
                Get a key inside the tool — no account or credit card, just accept the
                non-commercial terms.
              </p>

              <a href={TOOL_URL} className="pricing-btn primary-btn">Open the tool</a>
            </div>

            <div className="pricing-card commercial-card">
              <div className="pricing-header">
                <h3 className="pricing-title">Commercial</h3>
                <p className="pricing-description">For schools, organizations, and businesses</p>
              </div>

              <div className="pricing-badge commercial">Quoted per organization</div>

              <div className="pricing-features">
                <ul className="feature-list">
                  <li>
                    <span className="check-icon" />
                    <span><strong>Unlimited generation runs</strong></span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Shared team workspace with safe handoffs between staff</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Configurable session duration — or no expiry at all</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Priority email support</span>
                  </li>
                  <li>
                    <span className="check-icon" />
                    <span>Hosted setup available if you don&rsquo;t want to run it yourself</span>
                  </li>
                </ul>
              </div>

              <p className="pricing-note">
                Most licenses are set up within a day or two of first contact. Volume discounts
                exist — mention how many schools or teams you have.
              </p>

              <a href={`mailto:${CONTACT_EMAIL}?subject=Commercial%20license%20inquiry`} className="pricing-btn quiet-btn">
                Email for a quote
              </a>
            </div>
          </div>

          <div className="pricing-explainer">
            <h3>How workspaces and sessions work</h3>
            <p>
              Every license gets a private workspace on the server — your templates, roster,
              photos, and settings live there between visits. Opening the tool checks out a
              <em> session</em> on that workspace; closing it (or the Release Session button)
              hands it back.
            </p>
            <p>
              Personal licenses are device-locked: each device gets its own independent workspace.
              Commercial licenses share one workspace across the team, with one person holding the
              session at a time so two people can&rsquo;t overwrite each other&rsquo;s work. Sessions
              last 8 hours by default; commercial licenses can lengthen or disable that.
            </p>
          </div>

          <div className="pricing-faq">
            <h2>Common questions</h2>

            <div className="faq-item">
              <h4>Can a school use the free tier?</h4>
              <p>
                No — schools and other organizations need a commercial license even if they&rsquo;re
                non-profit. The free tier is for individuals working on personal projects.
              </p>
            </div>

            <div className="faq-item">
              <h4>What counts as commercial use?</h4>
              <p>
                Use by any organization, or use that generates revenue — including offering it as
                part of a service you charge for indirectly.
              </p>
            </div>

            <div className="faq-item">
              <h4>What happens when I hit the 5-run limit?</h4>
              <p>
                Generation pauses until the counter resets on the first of the next month.
                Everything else — uploading, matching, styling, previewing — keeps working, so you
                can have a spread staged and ready.
              </p>
            </div>

            <div className="faq-item">
              <h4>Can two people work on the same commercial license at once?</h4>
              <p>
                Not simultaneously — one person holds the workspace session at a time, which is what
                prevents two edits from colliding. Handoffs are quick: when one person closes the
                tool or releases the session, the next person picks up the same workspace with all
                templates, settings, and data intact.
              </p>
            </div>

            <div className="faq-item">
              <h4>Does an expired session delete my work?</h4>
              <p>
                Session expiry ends the checkout, not the workspace. Export your config file for
                anything you want to keep long-term — it captures the template, slots, fonts, and
                styling in one JSON file you can reload any time.
              </p>
            </div>
          </div>

          <div className="pricing-cta">
            <h2>Not sure which you need?</h2>
            <p>
              Describe what you&rsquo;re working on and we&rsquo;ll tell you honestly whether the
              free tier covers it.
            </p>
            <div className="cta-buttons">
              <a href={TOOL_URL} className="cta-btn primary-btn">Open the tool</a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="cta-btn secondary-btn">{CONTACT_EMAIL}</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
