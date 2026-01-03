import { withBase } from "../baseUrl";

export function AboutPage() {
  return (
    <main className="ss-page">
      <section className="ss-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">About</h1>
          <p className="ss-cover-subtitle">Revolutionizing yearbook production with local-first automation.</p>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner">
          <div className="panel">
            <h2>The Problem: The "Deadline Week" Nightmare</h2>
            <p className="muted">
              Every yearbook adviser and editor knows the struggle. You have a folder of 500 senior portraits, a spreadsheet of names, a folder of baby photos, and a list of quotes. Your deadline is in 48 hours.
            </p>
            <p className="muted">
              Traditionally, this meant hours of mind-numbing manual labor: dragging a photo onto a canvas, cropping it, typing the name, checking the spelling, finding the quote, typing the quote, resizing the text box... and then repeating that 499 more times. If a student drops out or a name is misspelled, you have to shift every single photo on the spread by hand. It's slow, brittle, and prone to human error.
            </p>

            <h2>The Solution: Intelligent Automation</h2>
            <p className="muted">
              The Yearbook Grad Mugshot Automator changes the game. It treats your yearbook spread as a data problem, not just a design problem. By understanding the structure of your page through our unique "Annotated Template" system, the tool can programmatically assemble perfect spreads in seconds.
            </p>

            <h3>Key Capabilities</h3>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <strong>Template-Aware Computer Vision:</strong> We don't force you into rigid grid layouts. Draw your design in Photoshop, InDesign, or Canva, mark the spots with our guide colours, and our engine "sees" your design intent.
              </li>
              <li>
                <strong>Smart Data Ingest:</strong> Drag and drop your spreadsheets and photo folders. The system handles the messy work of matching "Smith, John.jpg" to the student record for John Smith, even catching fuzzy matches and typos.
              </li>
              <li>
                <strong>Dynamic Text Fitting:</strong> Long names? Short quotes? The styling engine automatically adjusts text to look professional, respecting your font choices and alignment rules.
              </li>
              <li>
                <strong>Privacy-First Architecture:</strong> Unlike cloud-based design tools where you upload sensitive student data to a third-party server, this tool runs entirely locally on your machine. Your student data never leaves your computer.
              </li>
            </ul>

            <h3>Why this tool is different</h3>
            <p className="muted">
              Most design software is built for "one-off" creation. They are great for making a single poster, but terrible for batch processing hundreds of records. Database-driven tools like InDesign's Data Merge are powerful but have a steep learning curve and limited flexibility with complex layouts like "baby photo + senior portrait" combinations.
            </p>
            <p className="muted">
              This tool bridges the gap. It offers the power of database-driven design with the visual simplicity of a drag-and-drop interface, specifically tailored for the unique needs of yearbook staff.
            </p>

            <div className="inline" style={{ marginTop: 12 }}>
              <a href={withBase("tool")}>Open the Tool</a>
              <a href={withBase("how-to-use")}>Read How To Use</a>
              <a href={withBase("pricing")}>Pricing</a>
              <a href={withBase("license")}>License</a>
              <a href={withBase("privacy")}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
