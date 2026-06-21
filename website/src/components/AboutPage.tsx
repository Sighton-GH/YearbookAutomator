import { withBase } from "../lib/baseUrl";
import { TOOL_URL } from "../lib/env";

const ASSETS = {
  cover: withBase("assets/CoverImage1.webp"),
  annotatedTemplate: withBase("assets/showcase-annotated-template.webp"), // IMAGE SLOT: Template with colored annotation boxes (green mugshots, orange names, red quotes, blue baby photos)
  uploadInterface: withBase("assets/showcase-upload-interface.webp"), // IMAGE SLOT: Drag-and-drop upload step with spreadsheet + photos
  automaticMapping: withBase("assets/showcase-automatic-mapping.webp"), // IMAGE SLOT: Mapping review with photos matched to names and confidence
  finalOutput: withBase("assets/showcase-final-output.webp"), // IMAGE SLOT: Before/after spread (blank vs. fully rendered)
  babyPhotoProcessing: withBase("assets/showcase-baby-processing.webp"), // IMAGE SLOT: Baby photo with background removal and face centering
  quoteProcessing: withBase("assets/showcase-quote-processing.webp"), // IMAGE SLOT: Quote text wrapping and fitting in slot
  configSave: withBase("assets/showcase-config-save.webp"), // IMAGE SLOT: Config file save/load interface
};

export function AboutPage() {
  const placeholderStyle = {
    background: "var(--bg-quiet)",
    border: "1px dashed var(--border)",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center" as const,
    color: "var(--muted)",
  };

  return (
    <main>
      <section className="ss-cover ss-hero" style={{ backgroundImage: `url(${ASSETS.cover})` }}>
        <div className="ss-cover-inner">
          <div className="ss-cover-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, alignItems: "center" }}>
            <div className="ss-hero-card">
              <div className="ss-kicker">Portrait Autoflow for Custom Templates</div>
              <h1 className="ss-cover-title">Automated graduation spread generation</h1>
              <p className="ss-cover-subtitle">
                Upload your custom template and let portraits flow automatically into position. Specialty features for graduation spreads: quote processing, baby photo handling, background removal, and face centering.
              </p>
              <div className="ss-hero-actions">
                <a className="ss-cta" href={TOOL_URL}>Open the Tool</a>
                <a className="ss-cta" href={withBase("how-to-use")} style={{ background: "var(--bg-panel)", color: "var(--accent)", border: "1px solid var(--border)" }}>How it works</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ paddingTop: 40, paddingBottom: 12 }}>
        <div className="ss-content-inner">
          <div className="panel" style={{ overflow: "hidden", padding: 0 }}>
            <div style={{ padding: "18px 18px 8px 18px" }}>
              <div className="ss-kicker">Autoflow in action</div>
              <h2 style={{ marginBottom: 6 }}>Portraits flowing into your custom template</h2>
              <p className="muted" style={{ margin: 0 }}>
                Visual walkthrough of portraits moving from uploads into annotated slots—with quotes and baby photo support.
              </p>
            </div>
            <div className="autoflow-demo" aria-label="Portraits flowing into template slots">
              <div className="autoflow-spread">
                <div className="autoflow-slot s1" />
                <div className="autoflow-slot s2" />
                <div className="autoflow-slot s3" />
                <div className="autoflow-slot s4" />
                <div className="autoflow-slot s5" />
                <div className="autoflow-slot s6" />
                <div className="autoflow-name n1" />
                <div className="autoflow-name n2" />
                <div className="autoflow-name n3" />
                <div className="autoflow-name n4" />
                <div className="autoflow-name n5" />
                <div className="autoflow-name n6" />
              </div>
              <div className="autoflow-portraits">
                <div className="autoflow-portrait p1" />
                <div className="autoflow-portrait p2" />
                <div className="autoflow-portrait p3" />
                <div className="autoflow-portrait p4" />
                <div className="autoflow-portrait p5" />
                <div className="autoflow-portrait p6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="ss-content-inner">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Portrait Autoflow</div>
              <h3>Custom template support</h3>
              <p className="muted">Portraits automatically flow into your exact template design. No rigid grids—total layout freedom.</p>
            </div>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Graduation Spreads</div>
              <h3>Quote & baby photo processing</h3>
              <p className="muted">Specialty features: text wrapping, background removal, face centering for baby photos.</p>
            </div>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Privacy</div>
              <h3>Local-first architecture</h3>
              <p className="muted">Student data never leaves your computer. Perfect for strict privacy policies.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ background: "var(--bg-quiet)", paddingTop: 48, paddingBottom: 48 }}>
        <div className="ss-content-inner">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, alignItems: "center" }}>
            <div style={{ ...placeholderStyle, padding: "28px", minHeight: 300, background: "var(--bg-panel)", borderStyle: "solid" }}>
              <strong>IMAGE: Template Parsing</strong>
              <div style={{ fontSize: 13, marginTop: 8 }}>Computer vision detecting colored annotation boxes on yearbook template with visual overlay showing detected slots</div>
            </div>
            <div>
              <div className="ss-kicker">Template-Aware Computer Vision</div>
              <h2>Your design, automatically understood</h2>
              <p className="muted">
                Mark your custom template with color-coded boxes: green for portraits, orange for names, red for quotes, blue for baby photos. The parser detects your exact layout automatically.
              </p>
              <p className="muted">
                Works with any design: asymmetric grids, multi-column layouts, mixed orientations. The tool adapts to your template, not the other way around.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner">
          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", marginBottom: 32 }}>
            <h2>How it works</h2>
            <p className="muted">Four steps from blank template to print-ready composite with full portrait autoflow.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 1000, margin: "0 auto" }}>
            <div className="panel">
              <div className="ss-kicker">Step 1</div>
              <h3>Mark your template</h3>
              <p className="muted">Design your custom template and color-mark where portraits, names, quotes, and baby photos belong.</p>
              <div style={{ ...placeholderStyle, marginTop: 12, minHeight: 200, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Annotated Template</strong>
                <div style={{ fontSize: 13, marginTop: 6 }}>Custom yearbook template with green portrait boxes, orange name bars, red quote areas, blue baby photo cutouts</div>
              </div>
            </div>

            <div className="panel">
              <div className="ss-kicker">Step 2</div>
              <h3>Import roster & photos</h3>
              <p className="muted">Drag in your spreadsheet and photo folders. Automatic matching connects portraits to students.</p>
              <div style={{ ...placeholderStyle, marginTop: 12, minHeight: 200, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Upload Interface</strong>
                <div style={{ fontSize: 13, marginTop: 6 }}>Drag-and-drop interface with spreadsheet file + portrait folder + baby photo folder being uploaded</div>
              </div>
            </div>

            <div className="panel">
              <div className="ss-kicker">Step 3</div>
              <h3>Review & adjust</h3>
              <p className="muted">Verify automatic matches, configure fonts, adjust positioning, and set quote/baby photo options.</p>
              <div style={{ ...placeholderStyle, marginTop: 12, minHeight: 200, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Review Interface</strong>
                <div style={{ fontSize: 13, marginTop: 6 }}>Mapping review showing student portraits matched to names with confidence scores and manual override controls</div>
              </div>
            </div>

            <div className="panel">
              <div className="ss-kicker">Step 4</div>
              <h3>Generate & export</h3>
              <p className="muted">Render the complete spread with autoflow. Download high-resolution output ready for print.</p>
              <div style={{ ...placeholderStyle, marginTop: 12, minHeight: 200, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Final Output</strong>
                <div style={{ fontSize: 13, marginTop: 6 }}>Before/after: blank custom template transforming into fully rendered graduation spread with all portraits flowed in</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ paddingTop: 48, paddingBottom: 24 }}>
        <div className="ss-content-inner">
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32, alignItems: "center" }}>
            <div>
              <div className="ss-kicker">Configuration Management</div>
              <h2>Save and restore your work</h2>
              <p className="muted">
                Export your entire configuration—template, mappings, styling, quote settings—to a JSON file. Import it later to restore your exact setup instantly.
              </p>
              <p className="muted">
                Perfect for iterative workflows: save your progress, make changes to source data, reload the config, and regenerate spreads in seconds.
              </p>
            </div>
            <div style={{ ...placeholderStyle, padding: "28px", minHeight: 220, background: "var(--bg-panel)", borderStyle: "solid" }}>
              <strong>IMAGE: Config Save/Load</strong>
              <div style={{ fontSize: 13, marginTop: 8 }}>UI showing config export/import buttons with JSON file icon and restore progress indicator</div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ background: "var(--bg-quiet)", paddingTop: 48, paddingBottom: 48 }}>
        <div className="ss-content-inner">
          <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", marginBottom: 32 }}>
            <h2>Graduation spread specialties</h2>
            <p className="muted">Purpose-built features for the unique requirements of senior graduation pages.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            <div className="panel">
              <div style={{ ...placeholderStyle, marginBottom: 16, minHeight: 160, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Baby Photo Processing</strong>
                <div style={{ fontSize: 13, marginTop: 8 }}>Baby photo showing background removal, face detection overlay, and centered positioning in template cutout</div>
              </div>
              <div className="ss-kicker">Baby Photo Processing</div>
              <h3 style={{ fontSize: 18 }}>Background removal & face centering</h3>
              <p className="muted">Automatically remove backgrounds from baby photos and center on faces. Set custom fill colors to match your template design.</p>
            </div>

            <div className="panel">
              <div style={{ ...placeholderStyle, marginBottom: 16, minHeight: 160, background: "var(--bg-quiet)", borderStyle: "solid" }}>
                <strong>IMAGE: Quote Processing</strong>
                <div style={{ fontSize: 13, marginTop: 8 }}>Quote text showing automatic text wrapping, font sizing adjustment, and alignment within template slot</div>
              </div>
              <div className="ss-kicker">Quote Processing</div>
              <h3 style={{ fontSize: 18 }}>Smart text fitting</h3>
              <p className="muted">Automatically wrap and resize quotes to fit your template slots. Handles varying lengths gracefully with intelligent text adjustment.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 32, alignItems: "center" }}>
            <div>
              <div className="ss-kicker">Portrait Autoflow Engine</div>
              <h3>Hundreds of students, one click</h3>
              <p className="muted">
                Import your roster spreadsheet and photo folders. The autoflow engine automatically matches portraits to students by filename or name, then flows them into your template in the correct order.
              </p>
              <p className="muted">
                Configure placement modes: alphabetical by last name, left-to-right fill, or simultaneous spread filling. Face detection ensures portraits are centered perfectly in every slot.
              </p>
            </div>
            <div style={{ ...placeholderStyle, padding: "28px", minHeight: 240, background: "var(--bg-panel)", borderStyle: "solid" }}>
              <strong>IMAGE: Autoflow Sequence</strong>
              <div style={{ fontSize: 13, marginTop: 8 }}>Diagram showing portraits flowing from folder → matching → template slots in sequence with arrows</div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="ss-content-inner">
          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", marginBottom: 32 }}>
            <h2>Why</h2>
            <p className="muted">Designed by yearbook makers, for yearbook makers.</p>
          </div>

          <div className="panel" style={{ maxWidth: 900, margin: "0 auto 20px" }}>
            <h3>Built for real yearbook workflows</h3>
            <p className="muted">
              This tool was created by people who understand yearbook production firsthand. Every feature is designed with controllability, ease of use, and reliability in mind—from initial template parsing to final export.
            </p>
            <p className="muted">
              Save and restore your configuration at any time, export high-resolution output ready for print, and maintain full control over every aspect of your layout. No surprises, no hiccups.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 900, margin: "0 auto 32px" }}>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Control</div>
              <h3 style={{ fontSize: 16 }}>Full design flexibility</h3>
              <p className="muted" style={{ fontSize: 14 }}>Use any custom template layout. The tool adapts to your design, not the other way around.</p>
            </div>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Privacy</div>
              <h3 style={{ fontSize: 16 }}>Local processing</h3>
              <p className="muted" style={{ fontSize: 14 }}>Student data never leaves your computer, meeting strict privacy requirements.</p>
            </div>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Ease of Use</div>
              <h3 style={{ fontSize: 16 }}>Configuration saving</h3>
              <p className="muted" style={{ fontSize: 14 }}>Save your work and restore it anytime. No redoing steps or losing progress.</p>
            </div>
            <div className="panel">
              <div className="ss-kicker" style={{ color: "var(--accent)" }}>Export</div>
              <h3 style={{ fontSize: 16 }}>Print-ready output</h3>
              <p className="muted" style={{ fontSize: 14 }}>Export high-resolution images ready for professional printing.</p>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div className="ss-hero-actions" style={{ justifyContent: "center" }}>
              <a className="ss-cta" href={TOOL_URL}>Open the Tool</a>
              <a className="ss-cta" href={withBase("how-to-use")} style={{ background: "var(--bg-panel)", color: "var(--accent)", border: "1px solid var(--border)" }}>View Tutorial</a>
              <a className="ss-cta" href={withBase("pricing")} style={{ background: "var(--bg-panel)", color: "var(--accent)", border: "1px solid var(--border)" }}>See Pricing</a>
            </div>
            <div style={{ marginTop: 20, fontSize: 14 }} className="muted">
              <a href={withBase("privacy")} style={{ color: "var(--muted)" }}>Privacy Policy</a> · <a href={withBase("license")} style={{ color: "var(--muted)" }}>License Terms</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
