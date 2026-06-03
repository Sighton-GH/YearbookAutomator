import { useState } from "react";
import { withBase } from "../baseUrl";

const ASSETS = {
  templateClean: withBase("assets/Clean Sample.webp"),
  templateAnnotated: withBase("assets/Annotated Sample.webp"),
};

type Section = "getting-started" | "licensing-sessions" | "template-setup" | "data-preparation" | "workflow" | "styling" | "save-load-config" | "background-removal" | "troubleshooting" | "tips";

export function DocumentationPage() {
  const [activeSection, setActiveSection] = useState<Section>("getting-started");

  const sections: { id: Section; title: string; category: string }[] = [
    { id: "getting-started", title: "Getting Started", category: "Fundamentals" },
    { id: "licensing-sessions", title: "Licensing & Sessions", category: "Fundamentals" },
    { id: "template-setup", title: "Template Setup", category: "Fundamentals" },
    { id: "data-preparation", title: "Data Preparation", category: "Preparation" },
    { id: "workflow", title: "Step-by-Step Workflow", category: "Workflow" },
    { id: "styling", title: "Styling & Typography", category: "Customization" },
    { id: "save-load-config", title: "Save/Load Config", category: "Workflow" },
    { id: "background-removal", title: "Background Removal", category: "Features" },
    { id: "troubleshooting", title: "Troubleshooting", category: "Support" },
    { id: "tips", title: "Tips & Best Practices", category: "Support" },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "getting-started":
        return <GettingStartedSection />;
      case "licensing-sessions":
        return <LicensingSessionsSection />;
      case "template-setup":
        return <TemplateSetupSection />;
      case "data-preparation":
        return <DataPreparationSection />;
      case "workflow":
        return <WorkflowSection />;
      case "styling":
        return <StylingSection />;
      case "save-load-config":
        return <ConfigurationSection />;
      case "background-removal":
        return <BackgroundRemovalSection />;
      case "troubleshooting":
        return <TroubleshootingSection />;
      case "tips":
        return <TipsSection />;
      default:
        return <GettingStartedSection />;
    }
  };

  return (
    <main className="ss-page">
      <section className="ss-content">
        <div className="ss-content-inner">
          <div className="ss-doc-wrapper">
            {/* Left Sidebar TOC */}
            <aside className="ss-doc-sidebar">
              <nav className="ss-doc-toc">
                <h3 className="ss-doc-toc-title">Documentation</h3>
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href="#"
                    className={`ss-doc-toc-link ${activeSection === section.id ? "active" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection(section.id);
                    }}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </aside>

            {/* Main Content */}
            <article className="ss-doc-content">
              {renderContent()}
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

function LicensingSessionsSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Fundamentals</div>
      <h2>Understanding Licensing & Workspaces</h2>
      <p className="muted">
        When you use the Yearbook Grad Mugshot Automator, the tool creates a private <strong>workspace</strong> for your project. A workspace is an isolated folder that stores your templates, student data, images, and styling choices. Understanding how workspaces work helps you get the most out of the tool, especially when using multiple devices or sharing a license.
      </p>

      <h3>What is a Workspace?</h3>
      <p className="muted">
        Think of a workspace like a project folder on your computer. It contains:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Your template images (clean and annotated)</li>
        <li>Student roster and portrait files</li>
        <li>Baby photos and quotes</li>
        <li>Your styling choices (fonts, sizes, colours)</li>
        <li>Generated output files (PNGs)</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        By default, workspaces stay active for up to 8 hours of activity. If you step away and come back later, your workspace is still there with all your work preserved. If a workspace expires from inactivity, the data is preserved and can be recovered, but you'll create a fresh new workspace on your next visit.
      </p>

      <h3>Personal License: Device-Locked Workspaces</h3>
      <p className="muted">
        With a <strong>free personal license</strong>, each device you use gets its own completely separate workspace. The license is locked to the device, meaning:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Device-specific:</strong> Your laptop has its own workspace, your phone has a completely different one, your desktop has another—they are entirely independent</li>
        <li><strong>No shared access:</strong> You cannot access the same workspace on different devices. Each device maintains its own templates, settings, and project data</li>
        <li><strong>Perfect for solo users:</strong> Work on different projects from different devices without complications or interference</li>
        <li><strong>No waiting:</strong> You can switch devices instantly without worrying about locks or conflicts</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        Example: You design templates on your laptop (stored in laptop workspace). When you switch to your desktop, you start fresh with a new workspace. If you want to reuse the templates, you'll need to re-upload them. Each device is completely independent.
      </p>

      <h3>Commercial License: Shared Collaborative Workspace</h3>
      <p className="muted">
        With a <strong>commercial license</strong>, your team gets one shared workspace that serves as the single source of truth for your entire yearbook project. Multiple team members can contribute to the same workspace, making it perfect for collaborative environments.
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Centralized project:</strong> Everyone works from the same templates, settings, and student data. No duplication, no version confusion</li>
        <li><strong>Safe collaboration:</strong> Only one person works in the workspace at a time to prevent conflicts. Safe handoffs mean Person A can finish, Person B takes over seamlessly</li>
        <li><strong>Shared templates & styling:</strong> Once your yearbook design and styling are perfected, every team member uses the exact same setup</li>
        <li><strong>Organized workspace:</strong> All work stays in one place; everyone accessing the license sees the same templates and settings</li>
        <li><strong>Team efficiency:</strong> Perfect for workstations where multiple staff members take shifts or collaborate on yearbook generation</li>
      </ul>

      <h3>Multi-Device Scenarios</h3>

      <h4>Scenario 1: Personal License, Multiple Devices</h4>
      <p className="muted">
        You have a personal (free) license and use it on your laptop, desktop, and tablet.
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Laptop workspace:</strong> Design templates and finalize styling (stored on laptop)</li>
        <li><strong>Desktop workspace:</strong> Completely separate—start fresh or re-upload templates (stored on desktop)</li>
        <li><strong>Tablet workspace:</strong> Another independent workspace for mobile work (stored on tablet)</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        Each device maintains its own completely separate workspace. To use the same templates across devices, you'd need to save/load your config file and upload it to each device. Perfect for flexibility—no waiting or conflicts, but not shared between devices.
      </p>

      <h4>Scenario 2: Commercial License, Shared Across Team</h4>
      <p className="muted">
        Your school has one commercial license assigned to the yearbook lab. Multiple staff members collaborate and take shifts on the same yearbook project.
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>9 AM:</strong> Staff member A opens the lab workstation, accesses the shared workspace, generates spreads for students 1-100</li>
        <li><strong>12 PM:</strong> Staff member A finishes and closes the tool, releasing the workspace</li>
        <li><strong>1 PM:</strong> Staff member B opens the tool on the same lab workstation and accesses the exact same workspace with all templates, styling, and student data</li>
        <li><strong>Result:</strong> Both team members contributed to one cohesive yearbook project without duplication or rework</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        The workspace contains all templates and styling set up once during initial configuration. Every team member who accesses the license uses the same design, ensuring consistency across the entire yearbook.
      </p>

      <h4>Scenario 3: Commercial License, Multiple Workstations</h4>
      <p className="muted">
        Your school has one commercial license but wants to use it from different computers (e.g., the lab and the library).
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Lab workstation:</strong> Opens the tool with the commercial license. Workspace locks to this computer.</li>
        <li><strong>Library computer:</strong> Someone tries to open the tool with the same license. They see "workspace locked" (because lab is actively using it)</li>
        <li><strong>Resolution:</strong> They wait ~2 minutes for the lab's lock to expire, then try again. Or the lab user closes their browser/finishes faster to release the lock.</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        This design prevents accidental data loss from multiple people editing the same workspace simultaneously.
      </p>

      <h3>Session Duration & Expiry</h3>
      <p className="muted">
        Sessions stay active while you're using the tool. If you're idle for more than 8 hours, the session expires. Here's what happens:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Workspace is preserved:</strong> All your templates, data, and settings remain on the server</li>
        <li><strong>Next time you visit:</strong> You can create a new workspace and all previous work is accessible if needed</li>
        <li><strong>No data loss:</strong> Nothing is deleted; it's just a way to keep things organized</li>
        <li><strong>Personal licenses:</strong> Get a fresh workspace per device automatically</li>
        <li><strong>Commercial licenses:</strong> Maintain the same exclusive workspace, just with a refreshed lock timer</li>
      </ul>

      <h3>Workspace Tips & Best Practices</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li><strong>Save your config:</strong> After perfecting your templates and styling, save the workspace config to reuse across years or share with team members</li>
        <li><strong>Close gracefully:</strong> When done, close the browser tab or use the end-session button for cleaner workspace cleanup</li>
        <li><strong>Plan for lock timeouts:</strong> With commercial licenses, locks expire after ~2 minutes of inactivity. If switching devices, wait a moment before trying the new one</li>
        <li><strong>Monitor device usage:</strong> If your commercial license seems stuck, ensure the other device isn't still holding the lock in a background tab</li>
      </ul>
    </div>
  );
}

function GettingStartedSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Getting Started</div>
      <h2>Overview & Workflow</h2>
      <p className="muted">
        The Yearbook Grad Mugshot Automator streamlines the complex process of creating yearbook spreads by treating your yearbook layout as a data problem, not just a design problem. Instead of manually placing hundreds of photos, names, and quotes, you describe your design once, and our computer vision engine assembles perfect spreads in seconds.
      </p>

      <h3>The Problem We Solve</h3>
      <p className="muted">
        Every yearbook adviser knows the struggle: you have a folder of 500 senior portraits, a spreadsheet of names, a folder of baby photos, and a list of quotes. Your deadline is in 48 hours. Traditionally, this meant hours of mind-numbing manual labor: dragging a photo onto a canvas, cropping it, typing the name, checking the spelling, finding the quote, typing the quote, resizing the text box... and repeating that 499 more times. If a student drops out or a name is misspelled, you have to shift every single photo on the spread by hand. It's slow, brittle, and prone to human error.
      </p>

      <h3>How It Works: The 8-Step Process</h3>
      <p className="muted">
        The tool follows a logical, guided workflow that breaks the complexity into manageable steps:
      </p>
      <ol className="muted" style={{ marginTop: 6 }}>
        <li><strong>Import Template</strong> — Upload your clean and annotated templates</li>
        <li><strong>Review Parsing</strong> — Verify the system understood your layout</li>
        <li><strong>Portraits</strong> — Upload student roster and mugshots</li>
        <li><strong>Quotes</strong> — (Optional) Add student quotes</li>
        <li><strong>Baby Photos</strong> — (Optional) Add baby photos</li>
        <li><strong>Styling</strong> — Customize fonts, sizes, and alignment</li>
        <li><strong>Review</strong> — Generate a preview to check quality</li>
        <li><strong>Results</strong> — Download final high-resolution spreads</li>
      </ol>

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
        <li>
          <strong>Flexible Layout Support:</strong> Works with any custom spread design. Whether you have 4 students per page or 16, vertical or horizontal layouts, the tool adapts.
        </li>
      </ul>

      <h3>Why This Tool is Different</h3>
      <p className="muted">
        Most design software is built for "one-off" creation. They excel at making a single poster but struggle with batch processing hundreds of records. Database-driven tools like InDesign's Data Merge are powerful but have a steep learning curve and limited flexibility with complex layouts like "baby photo + senior portrait" combinations.
      </p>
      <p className="muted">
        This tool bridges the gap. It offers the power of database-driven design with the visual simplicity of a drag-and-drop interface, specifically tailored for the unique needs of yearbook staff.
      </p>
    </div>
  );
}

function TemplateSetupSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Template Setup</div>
      <h2>Preparing Your Templates</h2>
      <p className="muted">
        The foundation of the entire process is your template. You need <strong>two versions</strong> of your spread design: the <em>Clean Template</em> (for the final output) and the <em>Annotated Template</em> (for the system to understand your layout). These are crucial for the system to work correctly.
      </p>

      <h3>What You Need to Prepare</h3>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>1. The Clean Template:</strong> This is the blank background image that will be used for the final generated result. It should contain all your static design elements (background graphics, page numbers, headers) but <em>no</em> placeholder boxes or guide colours. Think of it as the "canvas" onto which we'll place the dynamic elements.
        </li>
        <li>
          <strong>2. The Annotated Template:</strong> This is a copy of your template where you have drawn coloured rectangles to tell the system exactly where each item belongs. The system analyzes this image to detect the position and size of every slot. This is where our computer vision magic happens.
        </li>
      </ul>

      <h3>Template Guide & Colour Detection</h3>
      <p className="muted">
        The system uses computer vision to detect regions based on specific guide colours in your <strong>Annotated Template</strong>. You must draw filled rectangles in these exact colours for the parser to recognize them:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#00BF63', marginRight: 6, borderRadius: 2 }}></span>
          <strong>Portrait Boxes (Green #00BF63):</strong> Where the main student mugshot will be placed. This is typically the largest box per student.
        </li>
        <li>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#004AAD', marginRight: 6, borderRadius: 2 }}></span>
          <strong>Baby Photo Boxes (Blue #004AAD):</strong> Where the baby photo will be placed. Usually a smaller box in the corner of the mugshot area.
        </li>
        <li>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#FF751F', marginRight: 6, borderRadius: 2 }}></span>
          <strong>Name Text Boxes (Orange #FF751F):</strong> The area reserved for the student's name. Should be proportional to the longest name you expect.
        </li>
        <li>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#FF3131', marginRight: 6, borderRadius: 2 }}></span>
          <strong>Quote Text Boxes (Red #FF3131):</strong> The area reserved for the student's quote. Should accommodate your longest expected quote.
        </li>
      </ul>
      <p className="muted small">
        <em>Important: The system groups these boxes by proximity to form a single "slot" for each student. Ensure the boxes for one student are closer to each other than to their neighbours.</em>
      </p>

      <h3>Creating Your Templates: Step-by-Step</h3>
      <div style={{ marginTop: 20 }}>
        <h4>For the Clean Template:</h4>
        <ol className="muted" style={{ marginTop: 6, paddingLeft: 20 }}>
          <li>Design your yearbook spread in Photoshop, InDesign, Canva, or any design tool</li>
          <li>Include all static elements: page numbers, headers, background graphics, decorative elements</li>
          <li>Where student content will go, leave blank space or use a neutral background</li>
          <li>Export as PNG or high-quality JPEG (300 DPI recommended for print)</li>
        </ol>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>For the Annotated Template:</h4>
        <ol className="muted" style={{ marginTop: 6, paddingLeft: 20 }}>
          <li>Duplicate your clean template file</li>
          <li>For each student slot, draw coloured rectangles:
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Large green rectangle for the mugshot area</li>
              <li>Small blue rectangle in the corner for the baby photo (if you're using baby photos)</li>
              <li>Orange rectangle for the name area below or beside the mugshot</li>
              <li>Red rectangle for the quote area</li>
            </ul>
          </li>
          <li>Use the exact hex codes provided above (any variation in colour will fail detection)</li>
          <li>Make sure the boxes are filled (not just strokes/outlines)</li>
          <li>Export as PNG or JPEG (same dimensions as clean template)</li>
        </ol>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Visual Examples</h3>
        <div className="ss-media-grid">
          <figure className="ss-figure">
            <img className="ss-img" src={ASSETS.templateClean} alt="Clean template sample" />
            <figcaption className="muted">
              <strong>Clean Template:</strong> Upload this as the "Clean Template". It is the visual foundation for your final export. No coloured boxes here.
            </figcaption>
          </figure>
          <figure className="ss-figure">
            <img className="ss-img" src={ASSETS.templateAnnotated} alt="Annotated template sample" />
            <figcaption className="muted">
              <strong>Annotated Template:</strong> Upload this as the "Annotated Template". The system reads the coloured boxes to learn the layout and element positions.
            </figcaption>
          </figure>
        </div>
      </div>

      <h3>Technical Specifications</h3>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>File Format:</strong> PNG or JPEG (PNG recommended for transparency support)</li>
        <li><strong>Resolution:</strong> Minimum 1200x1500px; 300 DPI recommended for print quality</li>
        <li><strong>Dimensions:</strong> Both templates must be exactly the same size</li>
        <li><strong>Colour Mode:</strong> RGB or sRGB (CMYK not supported)</li>
        <li><strong>Box Size:</strong> Minimum box area should be around 400 pixels² for reliable detection</li>
      </ul>

      <h3>Advanced: Custom Detection Colours</h3>
      <p className="muted">
        If you need to use different colours (e.g., your design already uses green), the system allows you to customize the detection colours in the Import Template step. However, we recommend sticking with the defaults for best results.
      </p>
    </div>
  );
}

function DataPreparationSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Data Preparation</div>
      <h2>Preparing Your Student Data & Assets</h2>
      <p className="muted">
        The quality of your final output depends on the quality of your input data. This section covers how to prepare your student roster, portraits, baby photos, and quotes.
      </p>

      <h3>Student Roster (Spreadsheet)</h3>
      <p className="muted">
        You'll need a spreadsheet with at minimum the students' names. This is typically an Excel (.xlsx) or CSV file.
      </p>
      <h4>Required Columns:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>First Name</strong> — The student's first name (case-insensitive)</li>
        <li><strong>Last Name</strong> — The student's last name (case-insensitive)</li>
      </ul>
      <h4>Optional Columns:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Quote</strong> — If you prefer to include quotes in the spreadsheet instead of a separate file</li>
        <li>Any other columns will be ignored (you can include email, ID, etc. for your reference)</li>
      </ul>

      <h3>Mugshot Portraits</h3>
      <p className="muted">
        Collect all student mugshots into a single folder, then create a ZIP file containing them.
      </p>
      <h4>File Naming Convention:</h4>
      <p className="muted">
        The system will try to match portrait filenames to your student roster. Here are the supported patterns:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Numeric Pattern:</strong> <code>001.jpg</code>, <code>002.jpg</code>, <code>003.jpg</code> — Files are matched by row number in your spreadsheet (starting at row 1 for the first student).
        </li>
        <li>
          <strong>Name Pattern:</strong> <code>John Smith.jpg</code>, <code>jane_doe.jpg</code>, <code>Smith, John.jpg</code> — Files are matched to students by name using fuzzy matching.
        </li>
        <li>
          <strong>Mixed Patterns:</strong> The system can handle a mixture of naming conventions in the same ZIP file.
        </li>
      </ul>
      <h4>Image Specifications:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Format: JPEG, PNG, or WebP</li>
        <li>Resolution: Minimum 800x1000px; 2000x2500px recommended for print quality</li>
        <li>Aspect Ratio: Portrait (taller than wide) recommended; the system will crop to fit the template box</li>
        <li>File Size: Keep individual files under 10MB</li>
      </ul>

      <h3>Baby Photos (Optional)</h3>
      <p className="muted">
        If your spread includes baby photos, collect them into a ZIP file. The system uses intelligent fuzzy matching to pair baby photos with students.
      </p>
      <h4>File Naming:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><code>John Smith - baby.jpg</code> — Include the student's name</li>
        <li><code>Smith, John - baby.jpg</code> — Last name first works too</li>
        <li><code>John_Smith_baby.jpg</code> — Underscores instead of spaces</li>
        <li><code>001_baby.jpg</code> — Row-based numbering (if your mugshots use it)</li>
      </ul>
      <p className="muted small">
        <em>The matching system is forgiving and will catch variations like "Matt" vs "Matthew". You'll always have a chance to review and manually correct mismatches.</em>
      </p>
      <h4>Image Specifications:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Format: JPEG, PNG, or WebP</li>
        <li>Resolution: 400x500px minimum; 800x1000px recommended</li>
        <li>Aspect Ratio: Flexible; the system will scale and center the image</li>
      </ul>

      <h3>Student Quotes (Optional)</h3>
      <p className="muted">
        Quotes can be provided in a separate spreadsheet or inline in your student roster file. If separate, create a CSV or Excel file with two columns:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Name</strong> — The student's full name (first and last)</li>
        <li><strong>Quote</strong> — The student's quote or senior statement</li>
      </ul>
      <p className="muted">
        The system will match quotes to students by name using fuzzy matching, so exact spelling isn't required.
      </p>

      <h3>File Organization Checklist</h3>
      <div style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4, marginTop: 12 }}>
        <input type="checkbox" checked disabled /> Student roster spreadsheet (Excel or CSV)
        <br />
        <input type="checkbox" checked disabled /> All mugshots in one ZIP file
        <br />
        <input type="checkbox" checked disabled /> (Optional) Baby photos in a separate ZIP file
        <br />
        <input type="checkbox" checked disabled /> (Optional) Quotes in a separate spreadsheet
        <br />
        <input type="checkbox" checked disabled /> Clean template image
        <br />
        <input type="checkbox" checked disabled /> Annotated template image
      </div>
    </div>
  );
}

function WorkflowSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Workflow</div>
      <h2>Step-by-Step Workflow Guide</h2>
      <p className="muted">
        The tool guides you through an 8-step process. Here's what happens at each step and what you need to do.
      </p>

      <h3>Step 1: Import Template</h3>
      <p className="muted">
        Upload both your <strong>Clean Template</strong> (for the background) and your <strong>Annotated Template</strong> (for parsing). You can also customize the detection colours if needed, though the defaults are recommended.
      </p>
      <h4>What Happens Here:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>The system stores both template images</li>
        <li>It begins analyzing the annotated template for coloured boxes</li>
        <li>You can preview both images before proceeding</li>
      </ul>
      <h4>Pro Tips:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Check the preview to ensure both images loaded correctly</li>
        <li>If the images appear blurry or low-res, re-export at higher DPI</li>
        <li>Verify dimensions match between clean and annotated</li>
      </ul>

      <h3>Step 2: Review Parsing</h3>
      <p className="muted">
        The system analyzes your annotated template and displays what it detected. Verify that every student slot has been found and that the boxes are correctly grouped. Each "slot" should contain one portrait, one name, one quote, and optionally one baby photo.
      </p>
      <h4>What Happens Here:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>The system highlights detected boxes on your template</li>
        <li>It groups boxes into student slots</li>
        <li>It calculates precise positioning and sizing</li>
      </ul>
      <h4>What to Check:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Count: Are the number of slots equal to the number of students you have?</li>
        <li>Grouping: Is each slot's boxes (portrait, name, quote, baby) correctly grouped together?</li>
        <li>Positioning: Do the preview outlines align with your actual template design?</li>
        <li>Order: Are slots arranged in the correct reading order (left-to-right, top-to-bottom)?</li>
      </ul>
      <h4>If Something is Wrong:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Boxes not detected:</strong> Check that your annotated template uses the exact hex codes (#00BF63, #004AAD, #FF751F, #FF3131)</li>
        <li><strong>Wrong box grouped:</strong> Ensure boxes are closer to their student's boxes than to neighbours</li>
        <li><strong>Color drift:</strong> Use a colour picker tool to verify your hex codes match exactly</li>
        <li>You can go back and re-upload the templates after fixing the annotated version</li>
      </ul>

      <h3>Step 3: Portraits</h3>
      <p className="muted">
        Upload your student roster (Excel/CSV) and a ZIP file containing all student portraits. The system will attempt to match photos to students based on filenames.
      </p>
      <h4>What Happens Here:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>The roster is parsed and imported</li>
        <li>Portrait filenames are matched to students</li>
        <li>The system generates a preview showing the matches</li>
        <li>You can review and manually correct any mismatches</li>
      </ul>
      <h4>Matching Algorithm:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>If filenames are numeric:</strong> <code>001.jpg</code> maps to row 1, <code>002.jpg</code> to row 2, etc.</li>
        <li><strong>If filenames are names:</strong> Fuzzy matching finds the closest student name in your roster</li>
        <li><strong>If filenames are mixed:</strong> The system tries numeric first, then name matching for unmatched files</li>
      </ul>
      <h4>Manual Corrections:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Click on any student to view or change their assigned portrait</li>
        <li>You can upload additional portraits or remove mismatched ones</li>
        <li>All corrections are saved to your workspace and can be reviewed later</li>
      </ul>

      <h3>Step 4: Quotes</h3>
      <p className="muted">
        (Optional) Upload a spreadsheet or ZIP file containing student quotes. The system matches these to students by name. You can skip this step if your yearbook doesn't include quotes.
      </p>
      <h4>What Happens Here:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Quote file is parsed</li>
        <li>Quotes are matched to students by name (fuzzy matching)</li>
        <li>Unmatched quotes are flagged for review</li>
      </ul>

      <h3>Step 5: Baby Photos</h3>
      <p className="muted">
        (Optional) Upload a ZIP file of baby photos. The system uses smart fuzzy matching to pair filenames like "Smith, John - baby.jpg" with the student "John Smith". You'll have a chance to review these matches.
      </p>
      <h4>What Happens Here:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Baby photos are extracted and analyzed</li>
        <li>Names in filenames are extracted and matched to students</li>
        <li>Face detection helps center the baby's face in the final output</li>
        <li>You can customize the baby photo background colour (e.g., white, transparent)</li>
      </ul>

      <h3>Step 6: Styling</h3>
      <p className="muted">
        Customize the typography for names and quotes. You can upload your own font files (TTF/OTF) or use system fonts. Adjust size, alignment, and casing to match your school's style guide.
      </p>
      <h4>Options Available:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Font Family:</strong> Select from system fonts or upload custom TTF/OTF files</li>
        <li><strong>Font Size:</strong> Specify in pixels or let the system auto-fit to the box</li>
        <li><strong>Font Weight:</strong> Regular, bold, or extra bold</li>
        <li><strong>Alignment:</strong> Left, center, or right</li>
        <li><strong>Text Transform:</strong> Uppercase, lowercase, or as-is</li>
        <li><strong>Colour:</strong> Custom hex colour for text</li>
        <li><strong>Letter Spacing:</strong> Adjust spacing between characters</li>
      </ul>

      <h3>Step 7: Review</h3>
      <p className="muted">
        Generate a low-resolution preview of a single spread to check alignment, font sizes, and image crops. This is your last chance to make changes before the final render. The preview is fast to generate, so don't hesitate to iterate.
      </p>
      <h4>What to Check:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Portrait alignment and crop (faces should be centered)</li>
        <li>Baby photo positioning and sizing</li>
        <li>Name text size and readability</li>
        <li>Quote text size and alignment</li>
        <li>Overall layout balance and spacing</li>
        <li>Colour combinations and contrast</li>
      </ul>

      <h3>Step 8: Results</h3>
      <p className="muted">
        The system generates high-resolution PNGs of your spreads. If you have more students than fit on one page, it will automatically generate multiple output files (e.g., output_01.png, output_02.png, etc.). Download them and drop them straight into your yearbook software.
      </p>
      <h4>What You Get:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>High-resolution PNG files (same resolution as your clean template)</li>
        <li>Named sequentially for easy identification</li>
        <li>One spread per file (or multiple spreads if configured)</li>
        <li>Option to download all at once or individually</li>
      </ul>
      <h4>Next Steps:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Import the PNG files into your yearbook software (InDesign, Publisher, etc.)</li>
        <li>Place them on your spread pages</li>
        <li>Make any final adjustments or annotations</li>
        <li>Export to PDF or print</li>
      </ul>
    </div>
  );
}

function StylingSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Customization</div>
      <h2>Styling & Typography Control</h2>
      <p className="muted">
        The Styling step allows you to control exactly how names and quotes appear on your spreads. You have full control over fonts, sizes, alignment, and more.
      </p>

      <h3>Font Selection</h3>
      <h4>Using System Fonts:</h4>
      <p className="muted">
        The system includes common fonts like DejaVuSans, Courier New, Arial, and others. Select any available font from the dropdown. System fonts are recommended for fastest rendering.
      </p>

      <h4>Using Custom Fonts:</h4>
      <p className="muted">
        Upload your own TrueType (.ttf) or OpenType (.otf) font files. This allows you to match your school's official fonts or use creative typefaces.
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Supported Formats:</strong> .ttf, .otf, .ttc, .otc</li>
        <li><strong>File Size Limit:</strong> 10MB per font</li>
        <li><strong>Multi-Weight Fonts:</strong> Upload separate files for regular, bold, and italic variants</li>
        <li><strong>Licensing:</strong> Ensure you have rights to use the font in print publications</li>
      </ul>

      <h3>Typography Options</h3>
      <h4>Font Size</h4>
      <p className="muted">
        Specify the font size in pixels. The system will automatically scale text to fit the available box or you can lock to a specific size.
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Fixed Size:</strong> All names are exactly this height; text that doesn't fit gets sized down</li>
        <li><strong>Auto-Fit:</strong> System calculates the largest size that fits each name in its box</li>
      </ul>

      <h4>Font Weight</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Regular:</strong> Normal weight (suitable for most yearbooks)</li>
        <li><strong>Bold:</strong> Heavier weight for emphasis</li>
        <li><strong>Extra Bold:</strong> Maximum weight for maximum impact</li>
      </ul>

      <h4>Text Alignment</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Left:</strong> Text aligns to the left edge of the box</li>
        <li><strong>Center:</strong> Text is centered (most common for yearbooks)</li>
        <li><strong>Right:</strong> Text aligns to the right edge</li>
      </ul>

      <h4>Text Transform</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>As-Is:</strong> Use the case from your spreadsheet</li>
        <li><strong>UPPERCASE:</strong> Convert all text to uppercase</li>
        <li><strong>lowercase:</strong> Convert all text to lowercase</li>
        <li><strong>Title Case:</strong> Capitalize the first letter of each word</li>
      </ul>

      <h4>Text Colour</h4>
      <p className="muted">
        Specify a custom hex colour (e.g., #000000 for black, #FFFFFF for white). The colour applies to all names or quotes uniformly. You can set different colours for names vs. quotes.
      </p>

      <h4>Letter Spacing</h4>
      <p className="muted">
        Adjust the spacing between characters. Positive values increase spacing (for a spread-out look), negative values decrease spacing (for a compressed look). Measured in pixels.
      </p>

      <h3>Separate Styling for Names & Quotes</h3>
      <p className="muted">
        You can apply different styling to names vs. quotes. For example:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Names:</strong> Large, bold, uppercase font in black</li>
        <li><strong>Quotes:</strong> Smaller, regular weight, title case in dark gray</li>
      </ul>

      <h3>Advanced: Placement Modes</h3>
      <p className="muted">
        The tool supports different placement modes for multi-spread yearbooks:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Simultaneous:</strong> All students are placed in reading order across the entire spread. Use this if you have a single spread template.
        </li>
        <li>
          <strong>Left Then Right:</strong> Students fill the left page in reading order, then the right page. Use this for double-page spreads.
        </li>
      </ul>

      <h3>Preview & Iteration</h3>
      <p className="muted">
        After configuring your styling, the Review step generates a preview of one student's spread. This preview is low-resolution but fast to generate, so you can quickly iterate on styling choices.
      </p>
      <h4>Use the Preview to Verify:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Text size is readable but not oversized</li>
        <li>Text fits within the designated boxes</li>
        <li>Alignment looks balanced</li>
        <li>Colours have good contrast with the background</li>
        <li>Long names and quotes don't get cut off</li>
      </ul>

      <h3>Common Styling Scenarios</h3>
      <div style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4, marginTop: 12 }}>
        <strong>Classic Yearbook Style:</strong>
        <ul style={{ marginTop: 8, marginBottom: 12 }}>
          <li>Name: Large (36-48px), bold, black, uppercase, center-aligned</li>
          <li>Quote: Medium (14-18px), regular, dark gray, title case, center-aligned</li>
        </ul>

        <strong>Modern Minimalist:</strong>
        <ul style={{ marginTop: 8, marginBottom: 12 }}>
          <li>Name: Medium (28-32px), regular, black, as-is, center-aligned</li>
          <li>Quote: Small (12-14px), italic, medium gray, as-is, left-aligned</li>
        </ul>

        <strong>Bold & Vibrant:</strong>
        <ul style={{ marginTop: 8 }}>
          <li>Name: Large (42-54px), extra bold, custom colour, uppercase, center-aligned</li>
          <li>Quote: Medium (16-20px), bold, accent colour, title case, center-aligned</li>
        </ul>
      </div>
    </div>
  );
}

function ConfigurationSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Workflow</div>
      <h2>Save/Load Config</h2>
      <p className="muted">
        The tool allows you to save your workspace configuration (templates, styling choices, font selections, etc.) to a file. This lets you preserve your setup, share configurations with team members, or reuse settings across multiple yearbooks. Configurations are stored as JSON files that you can download, backup, or import into other workspaces.
      </p>

      <h3>What Gets Saved in a Configuration?</h3>
      <p className="muted">
        When you save a configuration file, the tool preserves:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Template Images:</strong> Both the clean and annotated templates (embedded in the config file as base64)
        </li>
        <li>
          <strong>Template Parsing Results:</strong> The detected slots, boxes, and layout structure
        </li>
        <li>
          <strong>Styling Settings:</strong> Font family, size, weight, alignment, text transform, colour, and letter spacing for names and quotes
        </li>
        <li>
          <strong>Custom Fonts:</strong> Any uploaded custom fonts (embedded in the config)
        </li>
        <li>
          <strong>Placement Mode:</strong> Whether you're using simultaneous or left-then-right placement
        </li>
        <li>
          <strong>Baby Photo Settings:</strong> Background colour, face centering preferences, and other baby photo options
        </li>
        <li>
          <strong>Naming Pattern & Advanced Matching:</strong> Your photo matching preferences
        </li>
      </ul>

      <p className="muted" style={{ marginTop: 12 }}>
        <em>Note: Actual student photos, names, quotes, and baby photos are NOT saved in the config file. Only the design and styling settings are preserved.</em>
      </p>

      <h3>Saving a Configuration</h3>
      <h4>From the Tool:</h4>
      <ol className="muted" style={{ marginTop: 6 }}>
        <li>
          At any point in the workflow, click the menu button (☰) in the top right corner
        </li>
        <li>
          Select "Save config"
        </li>
        <li>
          A JSON file will be downloaded with a timestamp in the filename (e.g., <code>config_2026-01-04_143022.json</code>)
        </li>
        <li>
          Store this file in a safe location (e.g., a shared drive, backup folder, or version control)
        </li>
      </ol>

      <h4>File Details:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Format:</strong> JSON (human-readable text)</li>
        <li><strong>Size:</strong> Typically 500KB - 2MB depending on template resolution and number of fonts</li>
        <li><strong>Filename Pattern:</strong> <code>config_YYYY-MM-DD_HHMMSS.json</code></li>
        <li><strong>Can be edited:</strong> If needed, you can edit the JSON file in a text editor, but this is not recommended unless you know what you're doing</li>
      </ul>

      <h3>Loading a Configuration</h3>
      <h4>From the Tool:</h4>
      <ol className="muted" style={{ marginTop: 6 }}>
        <li>
          Start in a new or existing workspace (you can start fresh or resume an existing workspace)
        </li>
        <li>
          Click the menu button (☰) in the top right corner
        </li>
        <li>
          Select "Upload config"
        </li>
        <li>
          Choose your saved <code>.json</code> config file
        </li>
        <li>
          The tool will import all templates, parsed slots, styling settings, and fonts
        </li>
        <li>
          You can now proceed to the Portraits step and upload new student data
        </li>
      </ol>

      <h4>What Happens After Loading:</h4>
      <p className="muted">
        After loading a config, the tool will:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Restore all template and styling settings to exactly how you saved them</li>
        <li>Skip you directly to the Portraits step (since templates and styling are already configured)</li>
        <li>Prepare you to upload new student rosters and photos</li>
        <li>Maintain all custom fonts and styling choices</li>
      </ul>

      <h3>Use Cases & Scenarios</h3>
      <div style={{ marginTop: 12 }}>
        <h4>Scenario 1: Reusing Templates Across Years</h4>
        <p className="muted">
          You design a yearbook spread template in Year 1 with specific styling. In Year 2, you want to generate spreads for a new class using the exact same design.
        </p>
        <ul className="muted" style={{ marginTop: 6 }}>
          <li>In Year 1, after finalizing styling, save the config</li>
          <li>Store the config file in a shared folder or backup</li>
          <li>In Year 2, load that config file</li>
          <li>Upload the new class's roster and photos</li>
          <li>Generate spreads with identical styling to the previous year</li>
        </ul>
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>Scenario 2: Team Collaboration</h4>
        <p className="muted">
          Different team members need to generate spreads using the same template and styling. Instead of each person setting up the tool from scratch, share a config file.
        </p>
        <ul className="muted" style={{ marginTop: 6 }}>
          <li>One person designs and configures the tool</li>
          <li>They save and share the config file</li>
          <li>Other team members load the config in their own workspace</li>
          <li>Everyone can now generate consistent spreads</li>
        </ul>
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>Scenario 3: Iterating on Design</h4>
        <p className="muted">
          You're experimenting with different styling options. Save a config at each iteration so you can compare or revert to previous designs.
        </p>
        <ul className="muted" style={{ marginTop: 6 }}>
          <li>Save config after trying styling option A</li>
          <li>Adjust and save config for option B</li>
          <li>Adjust and save config for option C</li>
          <li>Generate previews for each and compare</li>
          <li>Load the best version and proceed with generation</li>
        </ul>
      </div>

      <h3>Config File Format (Technical Details)</h3>
      <p className="muted">
        Config files are JSON with the following structure (simplified):
      </p>
      <div style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4, marginTop: 12, overflow: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
        <pre style={{ margin: 0 }}>
{`{
  "version": "1",
  "exportedAt": "2026-01-04T14:30:22Z",
  "templates": {
    "clean": "data:image/png;base64,...",
    "annotated": "data:image/png;base64,..."
  },
  "parsedSlots": [...],
  "styling": {
    "nameFont": {...},
    "quoteFont": {...}
  },
  "customFonts": {
    "MyFont": "data:font/ttf;base64,..."
  },
  "settings": {
    "placementMode": "simultaneous",
    "babyPhotoBackground": "white",
    ...
  }
}`}
        </pre>
      </div>

      <h3>Backup & Archival</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Keep multiple versions:</strong> If you iterate on styling, save configs with descriptive names (e.g., <code>config_design-v1.json</code>, <code>config_design-v2-bold.json</code>)
        </li>
        <li>
          <strong>Version control:</strong> Store config files in Git or another version control system to track changes over time
        </li>
        <li>
          <strong>Shared storage:</strong> If working as a team, store configs in a shared drive (Google Drive, OneDrive, Dropbox) so everyone has access
        </li>
        <li>
          <strong>Regular backups:</strong> Periodically back up your config files in case of accidental deletion
        </li>
      </ul>

      <h3>Troubleshooting Configs</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Config file won't load / "Invalid config file" error</strong>
        <ul className="muted" style={{ marginTop: 8 }}>
          <li>Ensure the file is a valid JSON file (not corrupted or edited incorrectly)</li>
          <li>Check that the file extension is <code>.json</code></li>
          <li>Try re-downloading or re-saving the config from a fresh workspace</li>
          <li>If the error persists, the config file may be from a different or incompatible version of the tool</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Config loads but templates are blurry / low quality</strong>
        <ul className="muted" style={{ marginTop: 8 }}>
          <li>Configs embed images as base64, which can slightly compress them during encoding</li>
          <li>This should not noticeably affect quality, but if you see degradation, you can:</li>
          <li>Re-upload your original template images instead of relying on the config</li>
          <li>Or, export the config and manually edit it to reference local file paths (advanced)</li>
        </ul>
      </div>

      <h3>FAQ: Configuration Management</h3>
      <div style={{ marginTop: 12 }}>
        <strong>Q: Can I share a config file with someone using a different computer/operating system?</strong>
        <p className="muted">
          Yes! Config files are platform-agnostic. You can share them with Windows, Mac, or Linux users, and they'll work identically.
        </p>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Q: If I upload new student data with a loaded config, will it overwrite my previous work?</strong>
        <p className="muted">
          No. Each workspace is independent. Loading a config sets up a new workspace with those templates and styling. Your previous work remains untouched.
        </p>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Q: Can I edit a config file directly to change styling?</strong>
        <p className="muted">
          Technically yes (it's JSON), but it's not recommended. Use the tool's UI to adjust styling, then save the updated config. This is safer and easier.
        </p>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Q: How long are config files valid? Will old configs work with future versions?</strong>
        <p className="muted">
          The tool maintains backward compatibility. Configs saved today should work with future versions. We'll provide migration guides if the format ever changes significantly.
        </p>
      </div>
    </div>
  );
}

function BackgroundRemovalSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Features</div>
      <h2>Background Removal</h2>
      <p className="muted">
        Background removal is an optional feature that automatically separates the subject (baby photo or portrait) from its background. This is particularly useful for baby photos, allowing you to display them against custom backgrounds or overlay them onto your template design without the original photo's background interfering. The tool uses advanced image processing to detect and remove backgrounds intelligently.
      </p>

      <h3>When to Use Background Removal</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Baby Photos:</strong> If your baby photos have busy or distracting backgrounds, background removal lets you present just the baby on a clean backdrop.
        </li>
        <li>
          <strong>Portrait Cleanup:</strong> Occasionally used for senior portraits with awkward backgrounds, though most professional mugshots are already on plain backgrounds.
        </li>
        <li>
          <strong>Creative Layouts:</strong> If you want to layer baby photos over design elements or use custom background colours that match your yearbook theme.
        </li>
        <li>
          <strong>Consistency:</strong> Ensures all baby photos have a uniform appearance regardless of their original backgrounds.
        </li>
      </ul>

      <h3>How Background Removal Works</h3>
      <p className="muted">
        The system uses machine learning-based image segmentation to analyze your photo and identify:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>Foreground:</strong> The main subject (baby's face, body, etc.)</li>
        <li><strong>Background:</strong> Everything else (walls, furniture, sky, etc.)</li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        Once identified, the background is removed and replaced with your chosen background colour (typically white, transparent, or a custom colour). The process is non-destructive to the subject and preserves fine details like hair, clothing, and edges.
      </p>

      <h3>Enabling Background Removal</h3>
      <h4>For Baby Photos (Baby Photos Step):</h4>
      <ol className="muted" style={{ marginTop: 6 }}>
        <li>
          In the Baby Photos step, look for the "Remove backgrounds" option
        </li>
        <li>
          Toggle it ON to enable background removal processing
        </li>
        <li>
          Choose a background colour:
          <ul style={{ marginTop: 6, paddingLeft: 20 }}>
            <li><strong>White:</strong> Clean, professional look (default)</li>
            <li><strong>Transparent:</strong> Allows the underlying template design to show through</li>
            <li><strong>Custom Colour:</strong> Pick any colour matching your yearbook theme</li>
          </ul>
        </li>
        <li>
          The tool will process all baby photos in the background
        </li>
        <li>
          Preview the results in the Review step before final generation
        </li>
      </ol>

      <h3>Processing & Performance</h3>
      <p className="muted">
        Background removal is computationally intensive and runs in the background while you continue working. Here's what to expect:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Speed:</strong> Typically 1-3 seconds per photo depending on image resolution and complexity
        </li>
        <li>
          <strong>Parallel Processing:</strong> Multiple photos are processed simultaneously to speed up the overall workflow
        </li>
        <li>
          <strong>Progress Tracking:</strong> You can monitor progress via the status indicator in the Baby Photos step
        </li>
        <li>
          <strong>Memory Usage:</strong> Ensure your system has at least 2GB of available RAM for optimal performance
        </li>
      </ul>

      <h3>Quality Considerations</h3>
      <h4>Best Results:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>Baby photos with simple, uniform backgrounds (walls, studio backgrounds)</li>
        <li>Clear contrast between the subject and background</li>
        <li>Well-lit photos with good detail preservation</li>
        <li>Subjects with distinct edges (not blurred or out of focus)</li>
      </ul>

      <h4>Challenging Cases:</h4>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Transparent/translucent elements:</strong> Hair with backlighting, lace clothing, or veils may have partial removal
        </li>
        <li>
          <strong>Complex patterns:</strong> Backgrounds with patterns similar to the subject's clothing may cause edge issues
        </li>
        <li>
          <strong>Very small subjects:</strong> Tiny people in large backgrounds may not be well-detected
        </li>
        <li>
          <strong>Low contrast:</strong> Photos where the subject blends into the background (e.g., white baby on white background)
        </li>
      </ul>

      <h3>Background Colour Options</h3>
      <h4>White Background (#FFFFFF)</h4>
      <p className="muted">
        The default choice. Works well with almost any design and prints reliably. Provides a professional, clean appearance.
      </p>

      <h4>Transparent Background</h4>
      <p className="muted">
        Allows your template design elements to show through the baby photo area. Useful for creative overlays or themed backgrounds. In the final PNG output, transparent areas will appear as the background colour you set during export.
      </p>

      <h4>Custom Colour</h4>
      <p className="muted">
        Choose any hex colour to match your yearbook theme. For example:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li><strong>#F5F5F5:</strong> Light gray (subtle, less stark than white)</li>
        <li><strong>#E8F0F8:</strong> Soft blue (matches many yearbook themes)</li>
        <li><strong>#FFF8DC:</strong> Cream (warm, vintage feel)</li>
        <li><strong>#000000:</strong> Black (bold, high-contrast)</li>
      </ul>

      <h3>Manual Adjustment</h3>
      <p className="muted">
        Background removal is automatic, but if the results are not perfect:
      </p>
      <ul className="muted" style={{ marginTop: 6 }}>
        <li>
          <strong>Edit originals:</strong> If removal was unsatisfactory, manually remove backgrounds in Photoshop or a similar tool before uploading
        </li>
        <li>
          <strong>Use pre-edited photos:</strong> If you have baby photos pre-edited with backgrounds already removed, upload those directly (they'll skip the removal step)
        </li>
        <li>
          <strong>Disable removal:</strong> Toggle background removal OFF if you prefer to use the original photos as-is
        </li>
      </ul>

      <h3>Common Background Removal Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Hairline or edges are jagged / "frayed"</strong>
        <p className="muted">
          The algorithm had difficulty with fine hair or clothing edges.
        </p>
        <ul className="muted" style={{ marginTop: 8 }}>
          <li>This is normal with complex edges. Consider applying a slight blur or feather to smooth the transition.</li>
          <li>Or, use pre-edited photos where you've manually cleaned up the edges in Photoshop.</li>
          <li>In some cases, reducing the "aggressiveness" of removal (if available) can help.</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Part of the subject was removed / "holes" in the photo</strong>
        <p className="muted">
          The algorithm mistakenly identified part of the subject as background.
        </p>
        <ul className="muted" style={{ marginTop: 8 }}>
          <li>This often happens with transparent elements (like lace, veils, or backlighting on hair).</li>
          <li>Try manually editing the photo in Photoshop to separate the subject more clearly.</li>
          <li>Or, disable background removal and use the photo as-is.</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Background wasn't fully removed / patches of original background remain</strong>
        <p className="muted">
          The algorithm didn't fully detect the background boundary.
        </p>
        <ul className="muted" style={{ marginTop: 8 }}>
          <li>Check that the original photo has clear contrast between subject and background.</li>
          <li>Try using a different background colour to see if that improves appearance.</li>
          <li>Manually touch up in Photoshop if only small patches remain.</li>
        </ul>
      </div>

      <h3>Tips for Best Results</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Test first:</strong> Enable background removal on a few baby photos first, review in the Preview step, before applying to all photos.
        </li>
        <li>
          <strong>Choose appropriate colour:</strong> If using transparent or custom colours, preview with your actual template to ensure they look good together.
        </li>
        <li>
          <strong>Lighting matters:</strong> Well-lit photos with clear subject/background separation will have better results than dimly-lit or shadowy photos.
        </li>
        <li>
          <strong>High resolution:</strong> Higher-resolution photos (800x1000px or larger) provide more detail for accurate edge detection.
        </li>
        <li>
          <strong>Consistent styling:</strong> If using background removal, apply it consistently across all baby photos for a uniform look.
        </li>
        <li>
          <strong>Combine with other adjustments:</strong> After removal, you can adjust brightness, contrast, or colours in post-processing if needed.
        </li>
      </ul>

      <h3>Privacy & Processing</h3>
      <p className="muted">
        All background removal processing happens locally on your machine. Baby photo images are never uploaded to external servers. The processing uses your computer's resources, so performance depends on your system's capabilities.
      </p>
    </div>
  );
}

function TroubleshootingSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Troubleshooting</div>
      <h2>Common Issues & Solutions</h2>
      <p className="muted">
        Encountering problems? This section walks you through the most common issues and how to fix them.
      </p>

      <h3>Template Parsing Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Parsing finds zero slots</strong>
        <p className="muted">
          The system cannot detect any coloured boxes in your annotated template.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>Verify that your annotated template uses the exact hex codes (#00BF63, #004AAD, #FF751F, #FF3131)</li>
          <li>Use a colour picker tool to confirm your hex values match exactly</li>
          <li>Ensure the boxes are <strong>filled</strong> (not just outlines or strokes)</li>
          <li>Check that each box has a minimum area of 400 pixels² (roughly 20x20 pixels)</li>
          <li>Verify that the boxes don't have anti-aliasing or transparency; they should be solid colours</li>
          <li>Re-export your template from your design tool and try again</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Some boxes detected, but not all</strong>
        <p className="muted">
          Only some of your coloured boxes are being found.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Causes & Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>Colour drift:</strong> Some colours may be slightly off. Use a colour picker on the boxes you drew vs. the hex codes. Even a 1-2 point difference can cause detection to fail.
          </li>
          <li>
            <strong>Compression artifacts:</strong> JPEG compression can alter colours. Try exporting your annotated template as PNG instead.
          </li>
          <li>
            <strong>Small boxes:</strong> Boxes under 400 pixels² may not be detected. Enlarge them in your design.
          </li>
          <li>
            <strong>Transparency:</strong> Boxes with partial transparency won't be detected. Ensure they're fully opaque.
          </li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Boxes grouped incorrectly</strong>
        <p className="muted">
          Boxes from different students are being grouped together into one slot.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Causes & Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>Proximity:</strong> The system groups boxes by how close they are. Ensure each student's boxes (portrait, name, quote, baby) are closer to each other than to the next student's boxes.
          </li>
          <li>
            <strong>Spacing:</strong> Increase the gap between student slots in your design.
          </li>
          <li>
            <strong>Box positioning:</strong> Reorganize your template so students are clearly separated.
          </li>
        </ul>
      </div>

      <h3>Data Import Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Spreadsheet errors / Column not found</strong>
        <p className="muted">
          The system can't find required columns in your roster.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>Ensure your spreadsheet has columns named exactly <strong>"First Name"</strong> and <strong>"Last Name"</strong> (case-sensitive)</li>
          <li>Check for extra spaces in column headers (e.g., "First Name " with a trailing space won't work)</li>
          <li>If using CSV, ensure the file is properly formatted and doesn't have encoding issues</li>
          <li>Try exporting from Excel as a fresh CSV file and uploading that</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Mismatched photos</strong>
        <p className="muted">
          Students are being matched to the wrong portraits.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>If using numeric filenames:</strong> Ensure they correspond to spreadsheet row numbers. Row 1 (first student) should be <code>001.jpg</code> or <code>1.jpg</code>.
          </li>
          <li>
            <strong>If using name filenames:</strong> Try enabling "Advanced Name Matching" in the Portraits step to catch variations like "Matt" vs "Matthew".
          </li>
          <li>
            <strong>Manual correction:</strong> You can manually reassign portraits for any student in the Portraits step.
          </li>
          <li>
            <strong>File organization:</strong> Verify your ZIP file contains only image files at the root level (not in nested folders).
          </li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: ZIP file errors</strong>
        <p className="muted">
          The system can't read your ZIP files (mugshots, baby photos, etc.).
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>Ensure your ZIP file is not corrupted. Try extracting it on your computer to verify.</li>
          <li>Use a standard ZIP compression tool (Windows built-in, 7-Zip, WinRAR). Avoid exotic formats.</li>
          <li>Place all images at the <strong>root level</strong> of the ZIP, not in nested folders.</li>
          <li>Don't include system files (.DS_Store, Thumbs.db) in the ZIP. Most tools exclude these automatically.</li>
          <li>Ensure all files have standard extensions (.jpg, .png, .webp). Avoid uppercase extensions like .JPG on Linux/Mac.</li>
        </ul>
      </div>

      <h3>Generation Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Generation hangs or times out</strong>
        <p className="muted">
          The final render is taking too long or not completing.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>High resolution:</strong> If your template is very large (over 5000x7000px), rendering will be slow. Consider downscaling slightly.
          </li>
          <li>
            <strong>Many students:</strong> Rendering 500 students takes time. The system processes them sequentially. Check the progress indicator.
          </li>
          <li>
            <strong>System resources:</strong> Ensure your computer has at least 2GB free RAM during generation.
          </li>
          <li>
            <strong>Network:</strong> If running in a browser, ensure your internet connection is stable. Do not close the browser tab during generation.
          </li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Text doesn't fit in the box / Gets cut off</strong>
        <p className="muted">
          Names or quotes are overflowing their designated areas.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>Reduce font size:</strong> In the Styling step, use a smaller point size.
          </li>
          <li>
            <strong>Enable auto-fit:</strong> Let the system automatically reduce font size for long names/quotes.
          </li>
          <li>
            <strong>Reduce letter spacing:</strong> Use negative letter spacing to compress text.
          </li>
          <li>
            <strong>Expand box in template:</strong> Go back to your template and make the name/quote boxes larger.
          </li>
          <li>
            <strong>Shorten content:</strong> If possible, abbreviate long names or edit quotes in your spreadsheet.
          </li>
        </ul>
      </div>

      <h3>Quality Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Output images are blurry or low quality</strong>
        <p className="muted">
          Your final spreads don't look crisp enough for print.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>Template resolution:</strong> Your clean template should be at least 2400x3000px (300 DPI). Re-export at higher resolution.
          </li>
          <li>
            <strong>Mugshot resolution:</strong> Student portraits should be at least 2000x2500px. Provide higher-resolution images.
          </li>
          <li>
            <strong>Compression:</strong> Export your clean template as PNG (not JPEG) to avoid compression artifacts.
          </li>
          <li>
            <strong>Font rendering:</strong> Custom fonts may appear slightly different. Ensure they're properly installed and supported.
          </li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Photos have wrong crop / Face is cut off</strong>
        <p className="muted">
          Student portraits are cropped awkwardly or important parts are missing.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>Manual correction:</strong> In the Portraits step, click on a student to adjust their photo crop manually.
          </li>
          <li>
            <strong>Face detection:</strong> Enable face detection in the Mapping step to automatically center faces.
          </li>
          <li>
            <strong>Template box size:</strong> If the portrait box is very small or non-standard, the crop may be aggressive. Consider expanding it.
          </li>
        </ul>
      </div>

      <h3>Other Issues</h3>
      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Custom font not found</strong>
        <p className="muted">
          You uploaded a font, but it's not appearing in the font selector.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>Ensure the file is in TrueType (.ttf) or OpenType (.otf) format.</li>
          <li>Check that the file is not corrupted. Try opening it in a font viewer.</li>
          <li>Ensure the file size is under 10MB.</li>
          <li>Try re-uploading the font file.</li>
        </ul>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12, borderLeft: '4px solid #ff6b6b', paddingLeft: 12 }}>
        <strong>Problem: Baby photo not detected / Mismatched</strong>
        <p className="muted">
          Baby photos aren't being matched to the right students.
        </p>
        <strong style={{ marginTop: 8, display: 'block' }}>Solutions:</strong>
        <ul className="muted">
          <li>
            <strong>File naming:</strong> Ensure baby photo filenames include the student's name (e.g., "John Smith - baby.jpg").
          </li>
          <li>
            <strong>Fuzzy matching:</strong> The system is forgiving with names, but try using exact names for best results.
          </li>
          <li>
            <strong>Manual correction:</strong> In the Baby Photos step, you can manually reassign photos.
          </li>
        </ul>
      </div>
    </div>
  );
}

function TipsSection() {
  return (
    <div className="panel">
      <div className="ss-kicker">Tips & Best Practices</div>
      <h2>Pro Tips for Great Results</h2>
      <p className="muted">
        These tips and best practices will help you get the most out of the tool and produce professional-quality yearbook spreads.
      </p>

      <h3>Template Design Tips</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Use a consistent grid:</strong> Arrange students in a regular grid (e.g., 4 students per page in a 2x2 layout). This makes grouping easier and looks more professional.
        </li>
        <li>
          <strong>Adequate spacing:</strong> Leave enough room between student slots so they don't visually blend together.
        </li>
        <li>
          <strong>Clear hierarchy:</strong> Make portrait boxes the largest element, followed by names, then quotes. This guides the viewer's eye.
        </li>
        <li>
          <strong>Colour-safe design:</strong> Ensure your background colours don't too closely match your guide colours. The system needs to distinguish them.
        </li>
        <li>
          <strong>Modular thinking:</strong> Design your spread as a series of identical or similar student "cards". The tool will replicate this pattern.
        </li>
        <li>
          <strong>Leave breathing room:</strong> Don't cram text boxes tight against portraits. Add padding for visual clarity.
        </li>
      </ul>

      <h3>Data Preparation Best Practices</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Clean your roster:</strong> Before importing, remove any duplicate or test entries. One row = one student.
        </li>
        <li>
          <strong>Standardize naming:</strong> Use consistent capitalization and spacing for names. "John Smith", not "john smith" or "JOHN SMITH".
        </li>
        <li>
          <strong>Consistent photo filenames:</strong> If using numeric naming, ensure all files are zero-padded (001, 002, not 1, 2). This prevents sorting issues.
        </li>
        <li>
          <strong>High-resolution originals:</strong> Always start with the highest-resolution images available. You can't improve quality later.
        </li>
        <li>
          <strong>Organize early:</strong> Get all your data (roster, photos, quotes, baby photos) organized and in separate folders before starting the tool.
        </li>
        <li>
          <strong>Back up everything:</strong> Keep original copies of your roster and photos. If you need to rerun the tool, you'll have the originals.
        </li>
      </ul>

      <h3>Portrait Selection Tips</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Head-and-shoulders:</strong> Provide portraits that show the student from roughly shoulder/chest up. Full-body photos will crop awkwardly.
        </li>
        <li>
          <strong>Consistent lighting:</strong> If possible, all portraits should be shot under similar lighting. Dramatic shadows or backlighting will look mismatched in the spread.
        </li>
        <li>
          <strong>Consistent sizing:</strong> Ensure all portrait images are roughly the same size (e.g., all 2000x2400px). Very inconsistent sizes will look odd when combined.
        </li>
        <li>
          <strong>Face positioning:</strong> Ensure the student's face is centered in the portrait. The tool will crop to fit the template, but off-center faces may get cut off.
        </li>
        <li>
          <strong>Review mismatches:</strong> Always review the portrait matching step carefully. A wrong photo is obvious in the final output.
        </li>
      </ul>

      <h3>Styling Tips</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Generous font sizing:</strong> When in doubt, go larger. Names should be legible from arm's length. Don't make text so small it's hard to read.
        </li>
        <li>
          <strong>Test with longest names:</strong> During the Review step, make sure you can see how long names look. A name like "Alexander Montgomery" should still be readable.
        </li>
        <li>
          <strong>Contrast:</strong> Ensure text colour provides enough contrast with your background. Dark text on dark background or light on light will be hard to read.
        </li>
        <li>
          <strong>Font personality:</strong> Choose fonts that match your school's brand. A playful script font is very different from a clean sans-serif.
        </li>
        <li>
          <strong>Quote styling:</strong> Quotes are secondary to names and portraits. Consider making them smaller and/or a different colour.
        </li>
        <li>
          <strong>Preview iteration:</strong> Use the Review step liberally. Generate previews of different students to see how text fits with varying name/quote lengths.
        </li>
      </ul>

      <h3>Workflow Tips</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Take your time at parsing review:</strong> Getting the template parsing right is critical. Spend extra time here verifying everything looks correct. It's much faster to fix parsing issues now than later.
        </li>
        <li>
          <strong>Save your workspace:</strong> After successfully completing each step, you have a workspace saved. You can resume later without re-uploading everything.
        </li>
        <li>
          <strong>Iterative refinement:</strong> Don't expect perfection on the first try. Go back, adjust styling or templates, and re-run. The tool is fast enough for experimentation.
        </li>
        <li>
          <strong>Test with a subset:</strong> Consider generating spreads for just 4-5 students first to verify the quality before rendering all 200+.
        </li>
        <li>
          <strong>Document your choices:</strong> Keep notes on which template sizes, fonts, and styling choices work well. You can apply the same settings to future yearbooks.
        </li>
      </ul>

      <h3>Output & Integration Tips</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>PNGs are universal:</strong> The output PNG files work in virtually any yearbook software or design tool. You're not locked into a specific platform.
        </li>
        <li>
          <strong>Non-destructive:</strong> Generated spreads are just images. You can still adjust them in Photoshop or your yearbook software after generation.
        </li>
        <li>
          <strong>Batch download:</strong> If you have many spreads, use the "Download All" button to get a ZIP file with everything at once.
        </li>
        <li>
          <strong>Organize your files:</strong> Rename or move output files to an organized folder. It's easy to mix up spread files if you have many pages.
        </li>
        <li>
          <strong>Plan for updates:</strong> If you need to change a student's photo or quote later, you can update your workspace and regenerate just that spread.
        </li>
      </ul>

      <h3>Troubleshooting Prevention</h3>
      <ul className="muted" style={{ marginTop: 12 }}>
        <li>
          <strong>Double-check colours:</strong> Use a colour picker tool to verify your guide colours are exact. Many issues stem from colour drift.
        </li>
        <li>
          <strong>Test with small sets:</strong> When trying new font or styling, test with 2-3 students first before committing to 200.
        </li>
        <li>
          <strong>Read error messages:</strong> If something goes wrong, the tool provides specific error messages. Read them carefully; they often point to the solution.
        </li>
        <li>
          <strong>Use the preview religiously:</strong> The Preview step is your safety net. Use it to catch issues before the final high-resolution render.
        </li>
        <li>
          <strong>Communicate with yearbook team:</strong> If multiple people are preparing data (photos, roster, etc.), ensure everyone follows the same naming and organization conventions.
        </li>
      </ul>
    </div>
  );
}
