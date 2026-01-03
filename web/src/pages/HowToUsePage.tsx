const ASSETS = {
  cover: "/assets/CoverImage1.jpg",
  templateClean: "/assets/Clean Sample.png",
  templateAnnotated: "/assets/Annotated Sample.png",
};

export function HowToUsePage() {
  return (
    <main>
      <section className="ss-cover ss-hero" style={{ backgroundImage: `url(${ASSETS.cover})` }}>
        <div className="ss-cover-inner">
          <div className="ss-hero-card">
            <h1 className="ss-cover-title">Custom Yearbook Spread Automator</h1>
            <p className="ss-cover-subtitle">
              A guided tool to import your yearbook spread template, map student data and photos, then generate a
              finished composite spread.
            </p>
            <div className="ss-hero-actions">
              <a className="ss-cta" href="/tool">
                Open the Tool
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="ss-content ss-content-spaced">
        <div className="ss-content-inner">
          <div className="panel">
            <div className="ss-kicker">How To Use</div>
            <h2>Overview</h2>
            <p className="muted">
              This app streamlines the complex process of creating yearbook spreads. It follows a logical 8-step workflow:
              Import Template → Review Parsing → Portraits → Quotes → Baby Photos → Styling → Review → Results.
              By automating the placement of hundreds of elements, it saves days of manual layout work while ensuring consistency.
            </p>

            <h2>What you need to prepare</h2>
            <p className="muted">
              Before you begin, you must have two versions of your spread template ready. These are crucial for the system to understand your design:
            </p>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <strong>1. The Clean Template:</strong> This is the blank background image that will be used for the final generated result. It should contain all your static design elements (background graphics, page numbers, headers) but <em>no</em> placeholder boxes or guide colours.
              </li>
              <li>
                <strong>2. The Annotated Template:</strong> This is a copy of your template where you have drawn coloured rectangles to tell the system exactly where each item belongs. The system analyzes this image to detect the position and size of every slot.
              </li>
            </ul>

            <h2>Template Guide & Colour Detection</h2>
            <p className="muted">
              The system uses computer vision to detect regions based on specific guide colours in your <strong>Annotated Template</strong>. You must draw filled rectangles in these exact colours for the parser to recognize them:
            </p>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#00BF63', marginRight: 6, borderRadius: 2 }}></span>
                <strong>Portrait Boxes (Green #00BF63):</strong> Where the main student mugshot will be placed.
              </li>
              <li>
                <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#004AAD', marginRight: 6, borderRadius: 2 }}></span>
                <strong>Baby Photo Boxes (Blue #004AAD):</strong> Where the baby photo will be placed.
              </li>
              <li>
                <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#FF751F', marginRight: 6, borderRadius: 2 }}></span>
                <strong>Name Text Boxes (Orange #FF751F):</strong> The area reserved for the student's name.
              </li>
              <li>
                <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#FF3131', marginRight: 6, borderRadius: 2 }}></span>
                <strong>Quote Text Boxes (Red #FF3131):</strong> The area reserved for the student's quote.
              </li>
            </ul>
            <p className="muted small">
              <em>Note: The system groups these boxes by proximity to form a single "slot" for each student. Ensure the boxes for one student are closer to each other than to their neighbors.</em>
            </p>

            <div className="ss-media-grid">
              <figure className="ss-figure">
                <img className="ss-img" src={ASSETS.templateClean} alt="Clean template sample" />
                <figcaption className="muted">
                  <strong>Clean Template:</strong> Upload this as the "Clean Template". It is the visual foundation for your final export.
                </figcaption>
              </figure>
              <figure className="ss-figure">
                <img className="ss-img" src={ASSETS.templateAnnotated} alt="Annotated template sample" />
                <figcaption className="muted">
                  <strong>Annotated Template:</strong> Upload this as the "Annotated Template". The system reads the coloured boxes to learn the layout.
                </figcaption>
              </figure>
            </div>

            <h2>Step-by-Step Instructions</h2>
            <div className="stack" style={{ gap: 20, marginTop: 20 }}>
              <div>
                <h3>1. Import Template</h3>
                <p className="muted">
                  Upload both your <strong>Annotated Template</strong> (for parsing) and your <strong>Clean Template</strong> (for the background). You can also customize the detection colours if your design requires different guides, but the defaults are recommended.
                </p>
              </div>
              <div>
                <h3>2. Review Parsing</h3>
                <p className="muted">
                  The system will show you what it detected. Verify that every student slot has been found and that the boxes for Name, Quote, Portrait, and Baby Photo are correctly grouped. If a box is missing, check your annotated template colours and re-upload.
                </p>
              </div>
              <div>
                <h3>3. Portraits</h3>
                <p className="muted">
                  Upload your student roster (Excel or CSV) and a ZIP file containing all student portraits. The system will attempt to match photos to students based on filenames (e.g., matching row numbers or names). You can manually review and fix any mismatches.
                </p>
              </div>
              <div>
                <h3>4. Quotes</h3>
                <p className="muted">
                  (Optional) Upload a spreadsheet containing student quotes. The system matches these to students by name. You can skip this step if your yearbook doesn't include quotes.
                </p>
              </div>
              <div>
                <h3>5. Baby Photos</h3>
                <p className="muted">
                  (Optional) Upload a ZIP file of baby photos. The system uses smart fuzzy matching to pair filenames like "Smith, John - baby.jpg" with the student "John Smith". You'll have a chance to review these matches.
                </p>
              </div>
              <div>
                <h3>6. Styling</h3>
                <p className="muted">
                  Customize the typography for names and quotes. You can upload your own font files (TTF/OTF) or use system fonts. Adjust size, alignment, and casing (e.g., ALL CAPS) to match your school's style guide.
                </p>
              </div>
              <div>
                <h3>7. Review</h3>
                <p className="muted">
                  Generate a low-resolution preview of a single spread to check alignment, font sizes, and image crops. This is your last chance to make changes before the final render.
                </p>
              </div>
              <div>
                <h3>8. Results</h3>
                <p className="muted">
                  The system generates high-resolution PNGs of your spreads. If you have more students than fit on one page, it will automatically generate multiple output files (e.g., output_01.png, output_02.png). Download them and drop them straight into your yearbook software.
                </p>
              </div>
            </div>

            <h2>Common Issues & Troubleshooting</h2>
            <ul className="muted" style={{ marginTop: 6 }}>
              <li>
                <strong>Parsing finds zero slots:</strong> Check that your annotated template uses the exact hex codes listed above. Even a slight variation in colour can cause detection to fail.
              </li>
              <li>
                <strong>Spreadsheet errors:</strong> Ensure your roster spreadsheet has headers named "First Name" and "Last Name".
              </li>
              <li>
                <strong>Mismatched photos:</strong> If using numeric filenames, ensure they correspond to the spreadsheet row number (starting at 1 for the first student). If using names, try enabling "Advanced Name Matching" to catch variations like "Matt" vs "Matthew".
              </li>
              <li>
                <strong>Wrong files uploaded:</strong> Double-check that you haven't swapped the Clean and Annotated templates. The Annotated one must have the coloured boxes. Also verify that your ZIP files contain images, not nested folders.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
