import { withBase } from "../baseUrl";

const ASSETS = {
  cover: withBase("assets/CoverImage1.webp"),
  heroShowcase: withBase("assets/showcase-hero.webp"), // IMAGE SLOT: Hero collage of the tool UI (template parsing + final spread)
  annotatedTemplate: withBase("assets/showcase-annotated-template.webp"), // IMAGE SLOT: Template with colored annotation boxes (green mugshots, orange names, red quotes, blue baby photos)
  uploadInterface: withBase("assets/showcase-upload-interface.webp"), // IMAGE SLOT: Drag-and-drop upload step with spreadsheet + photos
  automaticMapping: withBase("assets/showcase-automatic-mapping.webp"), // IMAGE SLOT: Mapping review with photos matched to names and confidence
  finalOutput: withBase("assets/showcase-final-output.webp"), // IMAGE SLOT: Before/after spread (blank vs. fully rendered)
};

export function AboutPage() {
  const placeholderStyle = {
    background: "#f6f7fb",
    border: "1px dashed #c8cfe3",
    borderRadius: "12px",
    padding: "18px",
    textAlign: "center" as const,
    color: "#6a7291",
  };

  return (
    <main>
      <section
        className="ss-cover ss-hero"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(52, 82, 255, 0.14), rgba(0, 197, 163, 0.16)), url(${ASSETS.cover})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="ss-cover-inner" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32, alignItems: "center" }}>
          <div className="ss-hero-card" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.16)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div className="muted" style={{ letterSpacing: 0.5, textTransform: "uppercase", fontSize: 12, marginBottom: 10 }}>Yearbook Production OS</div>
            <h1 className="ss-cover-title" style={{ marginBottom: 12 }}>Ship graduation spreads in minutes, not days.</h1>
            <p className="ss-cover-subtitle" style={{ maxWidth: 640 }}>
              Upload your template, drop in photos and names, and let the automator assemble perfect yearbook pages. Local-first, template-aware, and built for deadline week.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <a className="ss-cta" href={withBase("tool")} style={{ padding: "12px 20px", fontSize: 16 }}>Open the Tool</a>
              <a className="ss-cta ghost" href={withBase("how-to-use")} style={{ padding: "12px 20px", fontSize: 16 }}>See how it works</a>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
              <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.1)", borderRadius: 10 }}><strong>⚡ 10x faster</strong> than manual layout</div>
              <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.1)", borderRadius: 10 }}><strong>🔒 Local-first</strong> data never leaves your device</div>
              <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.1)", borderRadius: 10 }}><strong>🎯 Template-aware</strong> computer vision parsing</div>
            </div>
          </div>

          <div style={{ ...placeholderStyle, padding: "32px", background: "rgba(255,255,255,0.8)", color: "#444", borderStyle: "solid", borderColor: "#e3e8f5" }}>
            <strong>IMAGE: Hero showcase</strong>
            <div style={{ marginTop: 8, fontSize: 14 }}>Collage of template parsing + final rendered spread + mapping review</div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ background: "#0b1021", color: "#eef1ff", paddingTop: 56, paddingBottom: 56 }}>
        <div className="ss-content-inner">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            <div style={{ background: "#111735", border: "1px solid #1c2445", borderRadius: 12, padding: 20 }}>
              <div className="muted" style={{ color: "#93a3ff", fontSize: 12, letterSpacing: 0.6 }}>Speed</div>
              <h3 style={{ marginTop: 6, marginBottom: 6 }}>From folder to finished spread fast</h3>
              <p className="muted" style={{ color: "#c7d1ff" }}>Process hundreds of students in the time it normally takes to lay out a single page manually.</p>
            </div>
            <div style={{ background: "#111735", border: "1px solid #1c2445", borderRadius: 12, padding: 20 }}>
              <div className="muted" style={{ color: "#93a3ff", fontSize: 12, letterSpacing: 0.6 }}>Accuracy</div>
              <h3 style={{ marginTop: 6, marginBottom: 6 }}>Template-aware computer vision</h3>
              <p className="muted" style={{ color: "#c7d1ff" }}>Understands your layout exactly as you designed it—no rigid grids or generic placeholders.</p>
            </div>
            <div style={{ background: "#111735", border: "1px solid #1c2445", borderRadius: 12, padding: 20 }}>
              <div className="muted" style={{ color: "#93a3ff", fontSize: 12, letterSpacing: 0.6 }}>Privacy</div>
              <h3 style={{ marginTop: 6, marginBottom: 6 }}>Local-first & offline-friendly</h3>
              <p className="muted" style={{ color: "#c7d1ff" }}>Student photos and data never leave your computer. Perfect for districts with strict privacy rules.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner" style={{ display: "grid", gap: 32 }}>
          <div>
            <h2 style={{ marginBottom: 8 }}>How it works</h2>
            <p className="muted" style={{ maxWidth: 840 }}>Four fast steps from blank template to print-ready composite. Replace each placeholder with real screenshots to make the story visual.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            <div style={{ border: "1px solid #e7eaf3", borderRadius: 12, padding: 18 }}>
              <div className="muted" style={{ fontSize: 13 }}>Step 1</div>
              <h3 style={{ marginTop: 4 }}>Mark your template</h3>
              <p className="muted">Design in your editor of choice and color-mark where mugshots, names, quotes, and baby photos belong.</p>
              <div style={{ ...placeholderStyle, marginTop: 12 }}>
                <strong>IMAGE: Annotated Template</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Template with green mugshot boxes, orange name bars, red quote areas, blue baby photos</div>
              </div>
            </div>

            <div style={{ border: "1px solid #e7eaf3", borderRadius: 12, padding: 18 }}>
              <div className="muted" style={{ fontSize: 13 }}>Step 2</div>
              <h3 style={{ marginTop: 4 }}>Import roster & photos</h3>
              <p className="muted">Drag in the spreadsheet and photo folders. The tool matches filenames to students automatically.</p>
              <div style={{ ...placeholderStyle, marginTop: 12 }}>
                <strong>IMAGE: Upload Interface</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Drag-and-drop upload with spreadsheet + portrait/baby photo folders</div>
              </div>
            </div>

            <div style={{ border: "1px solid #e7eaf3", borderRadius: 12, padding: 18 }}>
              <div className="muted" style={{ fontSize: 13 }}>Step 3</div>
              <h3 style={{ marginTop: 4 }}>Review & perfect</h3>
              <p className="muted">Approve matches, center faces, adjust fonts, and tweak spacing with live previews.</p>
              <div style={{ ...placeholderStyle, marginTop: 12 }}>
                <strong>IMAGE: Automatic Mapping</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Mapping review with confidence scores and manual overrides</div>
              </div>
            </div>

            <div style={{ border: "1px solid #e7eaf3", borderRadius: 12, padding: 18 }}>
              <div className="muted" style={{ fontSize: 13 }}>Step 4</div>
              <h3 style={{ marginTop: 4 }}>Generate & export</h3>
              <p className="muted">Render the full spread in seconds. Download high-res output ready for print.</p>
              <div style={{ ...placeholderStyle, marginTop: 12 }}>
                <strong>IMAGE: Final Output</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Before/after spread: blank template → fully rendered page</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content" style={{ background: "#f5f7fb", paddingTop: 56, paddingBottom: 56 }}>
        <div className="ss-content-inner" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, alignItems: "center" }}>
          <div>
            <h2 style={{ marginBottom: 10 }}>Why teams love it</h2>
            <ul className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
              <li><strong>Handles real-world chaos:</strong> Odd layouts, long quotes, mixed filename patterns, baby photos—no problem.</li>
              <li><strong>Protects student data:</strong> Everything runs locally with zero cloud uploads.</li>
              <li><strong>Looks like you designed it:</strong> Honors your fonts, spacing, and visual hierarchy.</li>
              <li><strong>Built for deadline week:</strong> Recover from last-minute roster changes without redoing pages.</li>
            </ul>
            <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
              <a className="ss-cta" href={withBase("tool")} style={{ padding: "12px 18px" }}>Start free</a>
              <a className="ss-cta ghost" href={withBase("pricing")} style={{ padding: "12px 18px" }}>View pricing</a>
              <a className="ss-cta ghost" href={withBase("how-to-use")} style={{ padding: "12px 18px" }}>Tutorial</a>
            </div>
          </div>

          <div style={{ ...placeholderStyle, padding: "28px" }}>
            <strong>IMAGE: Trust/benefit collage</strong>
            <div style={{ fontSize: 14, marginTop: 6 }}>Badges for "Local-first", "Template-aware", "500 students in minutes" or testimonial quote</div>
          </div>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner" style={{ display: "grid", gap: 16 }}>
          <h2 style={{ marginBottom: 6 }}>Why this tool exists</h2>
          <p className="muted">
            Yearbook advisers race against impossible deadlines with hundreds of names, quotes, portraits, and baby photos. Traditional design tools demand either painstaking manual layout or rigid mail-merge workflows.
          </p>
          <p className="muted">
            This automator blends your exact design with smart parsing, matching, and rendering so you can finish spreads quickly without sacrificing the look you planned.
          </p>
          <p className="muted">
            It is built for teams who care about accuracy, privacy, and speed—especially when the clock is ticking.
          </p>
          <div className="inline" style={{ marginTop: 12 }}>
            <a href={withBase("tool")}>Open the Tool</a>
            <a href={withBase("how-to-use")}>How to use</a>
            <a href={withBase("pricing")}>Pricing</a>
            <a href={withBase("license")}>License</a>
            <a href={withBase("privacy")}>Privacy</a>
          </div>
        </div>
      </section>
    </main>
  );
}
