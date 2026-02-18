import { withBase } from "../baseUrl";

export function PricingPage() {
  return (
    <main className="ss-page pricing-page">
      <section className="ss-cover pricing-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">Simple, Transparent Pricing</h1>
          <p className="ss-cover-subtitle">Start free. Scale as you grow. No hidden fees.</p>
        </div>
      </section>

      <section className="ss-content pricing-content">
        <div className="ss-content-inner">
          <div className="pricing-grid">
            {/* Personal Tier */}
            <div className="pricing-card personal-card">
              <div className="pricing-header">
                <h3 className="pricing-title">Personal Use</h3>
                <p className="pricing-description">For individuals and personal projects</p>
              </div>

              <div className="pricing-badge">Free</div>

              <div className="pricing-features">
                <ul className="feature-list">
                  <li>
                    <span className="check-icon">✓</span>
                    <span><strong>5 uses per month</strong></span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Local processing (your data stays on your device)</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Full feature access</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Community support</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Independent workspace per device</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>8-hour session duration</span>
                  </li>
                </ul>
              </div>

              <p className="pricing-note">Perfect for creating yearbook pages for yourself or friends.</p>

              <a href={withBase("tool")} className="pricing-btn primary-btn">Get Started Free</a>
            </div>

            {/* Commercial Tier */}
            <div className="pricing-card commercial-card featured">
              <div className="featured-badge">MOST POPULAR</div>
              <div className="pricing-header">
                <h3 className="pricing-title">Commercial License</h3>
                <p className="pricing-description">For schools, organizations & businesses</p>
              </div>

              <div className="pricing-badge commercial">Custom Pricing</div>

              <div className="pricing-features">
                <ul className="feature-list">
                  <li>
                    <span className="check-icon">✓</span>
                    <span><strong>Unlimited uses</strong></span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Priority email support</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Custom branding options</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Batch processing & automation</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Hosted solution available</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Regular updates & new features</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span><strong>Shared collaborative workspace</strong> for team projects</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>8-hour session duration</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Safe handoffs with workspace synchronization</span>
                  </li>
                </ul>
              </div>

              <p className="pricing-note">Great for schools generating yearbook pages at scale.</p>

              <a href="mailto:your-contact@domain.com" className="pricing-btn primary-btn">Contact for Quote</a>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="pricing-faq">
            <h2>Frequently Asked Questions</h2>

            <div className="faq-item">
              <h4>Can I use the free version for a school?</h4>
              <p>
                No, schools and educational institutions must use a commercial license, even if they're non-profit. Personal use is limited to individual projects.
              </p>
            </div>

            <div className="faq-item">
              <h4>How often do my free uses reset?</h4>
              <p>
                Free uses reset on the first day of each calendar month. Your 5 uses are refreshed automatically.
              </p>
            </div>

            <div className="faq-item">
              <h4>What counts as "commercial use"?</h4>
              <p>
                Any use for business purposes, by organizations, schools, or for generating revenue requires a commercial license. This includes using it as part of a service, even if you don't charge directly.
              </p>
            </div>

            <div className="faq-item">
              <h4>Can I get more free uses?</h4>
              <p>
                If you need more uses, you'll need to upgrade to a commercial license. Contact us for pricing and licensing options.
              </p>
            </div>

            <div className="faq-item">
              <h4>How long does licensing take?</h4>
              <p>
                Commercial licenses can typically be set up within 24-48 hours of agreement. We work with you to customize the solution for your needs.
              </p>
            </div>

            <div className="faq-item">
              <h4>Is there a discount for volume?</h4>
              <p>
                Yes! We offer volume discounts for larger organizations. Contact us to discuss your specific needs and get a custom quote.
              </p>
            </div>

            <div className="faq-item">
              <h4>Can two people use the same commercial license at the same time?</h4>
              <p>
                No, the software enforces that only one person actively works in the shared workspace at a time. This is a safety feature to prevent accidental conflicts and data loss. Team members can take turns using the workspace seamlessly—when one person finishes and closes the tool, the next person can immediately start working on the same project with all shared templates, settings, and data waiting for them.
              </p>
            </div>

            <div className="faq-item">
              <h4>What happens if my session expires after 8 hours of inactivity?</h4>
              <p>
                Your workspace is preserved, so nothing is lost. When you open the tool again, you can create a fresh workspace and all your previous work (templates, data, settings) remains accessible. It's just a way to keep things organized and clean up unused sessions. Your student data, photos, and styling choices are never deleted.
              </p>
            </div>
          </div>

          <div style={{ backgroundColor: "#f9f9f9", padding: "32px 24px", borderRadius: "8px", marginTop: "40px", marginBottom: "40px", textAlign: "center" }}>
            <h3 style={{ marginTop: 0 }}>How Workspaces & Sessions Work</h3>
            <p style={{ marginBottom: "12px", fontSize: "15px", lineHeight: "1.6" }}>
              All users get a secure workspace for their project. Personal licenses are device-locked—each device gets its own separate workspace, so you can work from your laptop, phone, or desktop completely independently with no interference. Commercial licenses provide a shared collaborative workspace—multiple team members can contribute to the same yearbook project from the same workstation, with safe handoffs to prevent conflicts.
            </p>
            <p style={{ marginBottom: 0, fontSize: "15px", lineHeight: "1.6" }}>
              Sessions stay active for 8 hours while you're working. If you step away and come back later, your workspace is still there with all your templates and settings preserved. No data loss, no hassle.
            </p>
          </div>

          {/* CTA Section */}
          <div className="pricing-cta">
            <h2>Ready to get started?</h2>
            <p>Choose your plan and start creating beautiful yearbook pages today.</p>
            <div className="cta-buttons">
              <a href={withBase("tool")} className="cta-btn primary-btn">Open the Tool</a>
              <a href="mailto:your-contact@domain.com" className="cta-btn secondary-btn">Contact Sales</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
