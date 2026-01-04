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
