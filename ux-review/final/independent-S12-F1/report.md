S12 evidence, F1 (interim; F4 not yet verified). Branch glm/plans-2-3 HEAD 3f8fbc69, real FastAPI backend + Vite UI, system Chrome, CPU only.
All data fictional/synthetic (scripts/make_synthetic_project.py, 40 students, seed 1; quotes for the first 2 students lengthened to wrap). NOT seeded/stubbed: every image is the backend's real render returned by "Preview with real rendering" (style strip: first 2 slots), saved byte-for-byte; verdicts come from pixel measurements (ink bbox/colour) plus viewing the image.
Default font Inter is not installed here, so the default renders as a fallback font (warning shown). Most runs use Liberation Sans (installed, has real bold/italic).

WORKED (output pixels changed as expected; baseline g1-v00-base)
Name AND quote, each:
- Text colour hex #d62828 -> red ink; swatch #1d7a1d -> green ink
- Font style Italic (Liberation, Gentium, uploaded VF italic) -> slanted glyphs
- Right align -> ink bbox moves right edge-flush; Centre align (FontPick) -> centred
- Vertical top/middle/bottom -> ink y shifts (quote box: top y19, middle y71, bottom y130 of 229)
- Letter spacing 8 -> wider (name 216->292 px); -2 -> tighter (216->208)
- Outline 3 default colour -> thicker glyphs; outline colour red -> visible red outline (see sheetA)
- Drop shadow default; shadow offset 12/12, blur 0, strength 1, colour #ff00ff -> magenta offset copy (sheetA)
- Font size, Bold, All caps -> visibly changed
- Reset these to standard -> back to baseline (h1-pre-reset vs h1-after-reset)
Quote only: Justify (last line left) -> lines widen to box edge, last line left (bbox 332-556 vs 332-532); line spacing 2.0 -> taller block (bottom y118->206), 0.7 -> tighter (->100).
Name fitting: Smallest size allowed 70 -> warning naming both students "does not fit at the minimum font size" (shrink and wrap modes). Quote min size 60 at 90pt -> same warning for quote. "Allow two lines" with min 70 -> name wraps to 2 lines (2nd line clipped at the strip's bottom edge, h1-fit-wrap-minsize70).
Real weights/italic: Gentium Basic upright/italic/bold/bold-italic all distinct; Liberation italic/bold distinct.
Font upload (.ttf): uploaded OpenSans variable font (wght,wdth axes; Open Sans, OFL) appears in the picker as "OpenSans-VF.ttf (uploaded)"; Name font auto-switches to it; I picked it for Quote. Normal vs Bold differ (variable wght axis 400 vs 700, sheetC). Uploaded Open Sans Italic VF with Normal style renders real italic; with Bold renders bold italic.
Upright-only family + Italic -> warning "has no usable italic face. Upright text was used." and upright render (as spec). Default Inter fallback + italic gives the same warning.

CAVEATS / NOT FULLY VERIFIED
- Name "Long names: allow two lines" vs "shrink": at size 90 with min 6 both outputs are pixel-identical (single shrunk line). Wrap only showed 2 lines when min size forced it. Possibly by design (two lines do not fit the name box height) but I did not prove that; treat the wrap-vs-shrink difference as not verified beyond the min-size case.
- Name line spacing: single-line names, so no visible change; not verified (needs a wrapped name). Quote line spacing verified.
- Name "Right or justified"/Justify only for quote, as in UI. Shadow sub-fields were varied together (across/down/blur/strength/colour), not individually.
- Strip shows only the first 2 slots, so no colour-emoji/CJK fallback check (F1.7 outside the control list).
- Reload persistence not rechecked by me.
No defects found in F1 controls so far.
F4 (contain/fill, baby shape/fill, PDF crop marks, DPI, safe area): NOT VERIFIED yet, in progress; separate report to follow.
Files: sheetA-E.png contact sheets (left cell of each strip), f1-base.png, plus per-variant strips in shots.
