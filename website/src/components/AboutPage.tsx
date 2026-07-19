import { withBase } from "../lib/baseUrl";
import { TOOL_URL } from "../lib/env";

const SHOTS = {
  people: withBase("assets/tool-people.webp"),
  template: withBase("assets/tool-template.webp"),
  uploads: withBase("assets/tool-uploads.webp"),
  style: withBase("assets/tool-style.webp"),
  generate: withBase("assets/tool-generate.webp"),
  outputPage: withBase("assets/output-left-page.webp"),
  outputDetail: withBase("assets/output-detail.webp"),
};

function ShotFrame({ src, alt, title }: { src: string; alt: string; title: string }) {
  return (
    <div className="shot-frame">
      <div className="shot-frame-bar">
        <span />
        <span />
        <span />
        <div className="shot-frame-title">{title}</div>
      </div>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

export function AboutPage() {
  return (
    <main>
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1>Grad spreads, assembled automatically</h1>
          <p className="home-hero-sub">
            Upload your page design, your roster spreadsheet, and a folder of portraits.
            Custom Flow Automator reads the layout, matches every photo to the right student,
            and renders print-ready spreads — names, quotes, and baby photos included.
          </p>
          <div className="ss-hero-actions">
            <a className="ss-cta" href={TOOL_URL}>Open the tool</a>
            <a className="ss-cta ss-cta-quiet" href={withBase("how-to-use")}>Read the documentation</a>
          </div>
          <p className="home-hero-note">
            Free for personal use (5 runs a month). Your student data is processed locally and never sold or shared.
          </p>
          <div className="home-hero-shot">
            <ShotFrame
              src={SHOTS.people}
              alt="The People step: a grid of matched student portraits with an inspector panel for editing one student"
              title="Custom Flow Automator — People"
            />
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>How it works</h2>
          <p>
            Five steps, in order, with nothing to install. Most of the work is checking
            what the tool already did.
          </p>
        </div>
        <div className="home-steps">
          <div className="home-step">
            <div className="home-step-num" />
            <div>
              <h3>Template</h3>
              <p>
                Mark your page design with coloured boxes — one colour each for portraits, names,
                quotes, and baby photos — and upload it next to the clean version. The tool detects
                every box, groups them into per-student slots, and shows you the result so you can
                nudge any box that needs it.
              </p>
              <div className="home-swatches">
                <span className="home-swatch"><i style={{ background: "#00BF63" }} />Portrait #00BF63</span>
                <span className="home-swatch"><i style={{ background: "#004AAD" }} />Baby photo #004AAD</span>
                <span className="home-swatch"><i style={{ background: "#FF751F" }} />Name #FF751F</span>
                <span className="home-swatch"><i style={{ background: "#FF3131" }} />Quote #FF3131</span>
              </div>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num" />
            <div>
              <h3>Uploads</h3>
              <p>
                Drop in your roster (Excel or CSV), a ZIP of portraits, and — optionally — quotes and
                baby photos. Files named <code>001.jpg</code>, <code>002.jpg</code> map to spreadsheet
                rows; files named after students match by name, including &ldquo;Smith, John&rdquo; and
                close misspellings.
              </p>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num" />
            <div>
              <h3>People</h3>
              <p>
                Every student gets a card showing their portrait, quote, and baby photo. Click one to
                fix a mismatch, swap a portrait, edit a quote, or crop and clean up a baby photo —
                including automatic background removal and face centering.
              </p>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num" />
            <div>
              <h3>Style</h3>
              <p>
                Set fonts, sizes, alignment, and casing for names and quotes separately. Upload your
                school&rsquo;s own TTF/OTF fonts if you have them.
              </p>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num" />
            <div>
              <h3>Generate</h3>
              <p>
                Render a one-page preview to sanity-check, then render everything. Output comes back at
                the full resolution of your template as PNG, PDF, or TIFF — ready to place in InDesign
                or send to the printer.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Your design, not a grid template</h2>
          <p>
            The tool doesn&rsquo;t impose a layout. It reads whatever you drew — asymmetric grids,
            two-page spreads, odd corners — and fills it.
          </p>
        </div>

        <div className="home-row">
          <div className="home-row-text">
            <h3>Layout detection you can see and correct</h3>
            <p>
              After parsing, every detected slot is drawn over your template. Click a box to see and
              edit its exact pixel coordinates in the inspector — portrait, baby, name, and quote
              regions independently.
            </p>
            <p>
              If your design already uses one of the guide colours, you can change the detection
              colours instead of changing your design.
            </p>
          </div>
          <ShotFrame
            src={SHOTS.template}
            alt="The Template step showing detected slot boxes overlaid on a two-page spread, with a slot's pixel coordinates open in the inspector"
            title="Template — detected slots"
          />
        </div>

        <div className="home-row flip">
          <div className="home-row-text">
            <h3>One screen to catch every mismatch</h3>
            <p>
              Matching is automatic, but yearbooks are full of exceptions: a student who dropped out,
              a photo with a typo in the filename, two students with the same name. The People step
              shows every match in one grid so an exception can&rsquo;t hide.
            </p>
            <p>
              Fixes cascade properly — removing a student shifts the rest up instead of leaving a
              hole to repair by hand.
            </p>
          </div>
          <ShotFrame
            src={SHOTS.people}
            alt="The People step with a student selected and the inspector open, showing portrait replacement, baby photo controls, and the quote editor"
            title="People — reviewing matches"
          />
        </div>

        <div className="home-row">
          <div className="home-row-text">
            <h3>Preview before you commit</h3>
            <p>
              The Generate step renders one page as a quick test before you run the whole batch, and
              shows what will change: total students, missing portraits, missing quotes.
            </p>
            <p>
              Placement is configurable — fill the left page first or both pages at once, keep roster
              order or force alphabetical by last name.
            </p>
          </div>
          <ShotFrame
            src={SHOTS.generate}
            alt="The Generate step showing export settings and a rendered preview of the finished spread"
            title="Generate — preview render"
          />
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>What comes out</h2>
          <p>
            A finished page from the bundled sample project — fictional students, real pipeline.
            Rendered at the template&rsquo;s native 5475&thinsp;×&thinsp;3675 pixels.
          </p>
        </div>
        <div className="home-output-grid">
          <figure>
            <img
              className="home-output-img"
              src={SHOTS.outputPage}
              alt="A fully rendered yearbook page with eight students: portraits, names, quotes, and baby photo cutouts placed on the template artwork"
              loading="lazy"
            />
            <figcaption>The full left page, exactly as exported.</figcaption>
          </figure>
          <figure>
            <img
              className="home-output-img"
              src={SHOTS.outputDetail}
              alt="Close-up of two rendered student slots showing portrait placement, wrapped quote text, and baby photo cutouts"
              loading="lazy"
            />
            <figcaption>
              Detail: quotes wrapped to fit their boxes, baby photos masked into non-rectangular
              cutouts, names typeset in your chosen font.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>The practical stuff</h2>
        </div>
        <div className="home-facts">
          <div className="home-fact">
            <h3>Student data stays local</h3>
            <p>
              Photos and rosters are processed on the machine running the tool, not shipped to a
              cloud service. That tends to make school privacy sign-off much easier.
            </p>
          </div>
          <div className="home-fact">
            <h3>Save your setup</h3>
            <p>
              Export template, slots, fonts, and styling to a single config file. Load it next year,
              upload the new class, and regenerate.
            </p>
          </div>
          <div className="home-fact">
            <h3>Baby photo cleanup built in</h3>
            <p>
              Crop, rotate, remove backgrounds, and center on faces without leaving the tool — no
              round-trip through Photoshop for eighty baby photos.
            </p>
          </div>
          <div className="home-fact">
            <h3>Works at yearbook scale</h3>
            <p>
              Hundreds of students across multiple spreads render in one run, numbered in sequence.
              Overflow students automatically continue onto the next spread.
            </p>
          </div>
        </div>
      </section>

      <section className="home-end">
        <div className="home-end-inner">
          <h2>Try it on the sample project</h2>
          <p>
            The tool ships with a small sample — template, roster, and portraits — so you can walk the
            whole flow in a few minutes before touching your own files.
          </p>
          <div className="cta-buttons">
            <a className="cta-btn primary-btn" href={TOOL_URL}>Open the tool</a>
            <a className="cta-btn secondary-btn" href={withBase("pricing")}>Pricing</a>
          </div>
        </div>
      </section>
    </main>
  );
}
