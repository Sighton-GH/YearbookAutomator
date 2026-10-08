S12 evidence, F4. Branch glm/plans-2-3 HEAD 3f8fbc69, real FastAPI backend + Vite UI, system Chrome, CPU only, export set to Custom 1000x650 px (UI control). Fictional synthetic data (scripts/make_synthetic_project.py). Not stubbed: PNGs are the backend's real "Render preview" output fetched from the preview <img>; PDFs/PNGs were saved with the UI's "Download preview" and inspected (PyMuPDF/PIL, rendered at 300 dpi and viewed).

WORKED
- Portrait shape: Ellipse, Rounded (radius 60), Border 10px red, Shadow all visibly change the rendered portraits (sheetG; diff vs base 18.9k / 4.0k / 16.1k / 18.1k px).
- Baby shape/border/shadow: on rectangle baby slots the square photo became a circle (Ellipse), then a rounded square with green 10px border, then with shadow (baby-zoom.png). Slots whose template mask is already a circle are unchanged, which matches the label "auto rectangle masks only".
- Fit "Show the whole portrait" (contain) + Fill colour: output changes vs "Fill the box (crop)" and the fill-colour pickers change the letterbox edge (red vs blue strip, contain-zoom1.png). WEAK evidence, see below.
- DPI: UI physical size updates (300 -> 84.7x55.0 mm, 600 -> 42.3x27.5, 150 -> 169.3x110.1, 1200 -> 21.2x13.8). Downloaded PNG metadata 150.01 dpi and 1199.998 dpi. PDF page size at 1000 px: 300 dpi = 240x156 pt, 600 dpi = 120x78 pt.
- PDF crop marks: 300 dpi with marks = MediaBox 276x192 pt (+18 pt = 0.25 in each side), TrimBox 18,18,258,174 (= the 240x156 page); rendered PDF shows corner crop marks outside the trim (pdf-marks.png). 150 dpi with marks = 516x348 pt, TrimBox 18..498 x 18..330 (correct). Checkbox is disabled unless export format is PDF (seen in code, enabled after choosing PDF).
- Safe area (Template step "Show safe area (preview only)"): red bleed + blue dashed safe rectangles drawn; insets follow the current DPI (at 1200 dpi 3 mm = 141.7 px, 6 mm = 283.5 px; setting safe inset to 20 mm moved the blue rect to 944.9 px; f4-safe-20mm.png). Unchecking removes the overlay.

NOT VERIFIED / CAVEATS
- Contain/fill letterboxing: the fixture portraits (3:4) fit the template box almost exactly, so contain only changes a thin edge strip. A clearly different aspect-ratio portrait test (wide/tall photo with big bars) was NOT run.
- "Centre crop on face" (needs GPU/face detection; skipped as instructed).
- Per-student baby fill (Inspector) and the global baby background colour (Uploads): NOT run.
- Resolution warning ("portraits upscaled >1.5x"): rendering at 1200 dpi did not show any new warning line in the page text; I did not confirm whether that is expected for 1000 px export. NOT verified.
- "Adjust portrait" editor / focus point: not run here.
- Harness note: my first PDF download attempt grabbed stale previews (race in my script); the f5-* files are the corrected ones and are what the numbers above come from. Not a product defect.
No F4 defects found in what was exercised.
