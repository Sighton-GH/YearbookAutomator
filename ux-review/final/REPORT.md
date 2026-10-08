# Final UX walkthrough

Review date: October 8, 2026. Product checkpoint: 0b62ed2d. Local Python 3.12.14 and Node 22.23.3. Only bundled fictional sample and generated names/drawn faces were used. Main viewport 1440x900; People also checked at 1024x768. No real student records or third-party uploads.

## Summary
A teacher can import the 40-student project, edit names and photos, move a student, render three spreads and download PNGs, ZIP and the verification spreadsheet. Missing quotes and baby photos are now explained before rendering. The real-render strip is more useful than the approximate sample preview. Slot numbers, selected handles and layout history make template corrections easier. Config export/reset/import restores the edited name, color, size, position and print settings, but requires every original and replacement source file. The dark Style preview and active Template controls are readable after the final contrast changes. Final visual checking caught missing F4 request wiring, which was fixed before the final downloaded images. Unicode fallback originally made the full-resolution preview take minutes on this machine's large font library; an early-stop/cache fix cut the three-spread render to under a minute. Remaining problems include tiny long names, an emoji substituted with a question mark, generic malformed-CSV feedback, and a long inspector that requires scrolling. Provider-specific background-removal/GPU paths are not established by this walkthrough.

## Findings
|ID|Scenario|Severity|What happened|Expected|Evidence|
|---|---|---|---|---|---|
|F01|S6/S7|Major|My moon emoji prints as a question mark; Generate explains the missing glyph.|Usable glyph where a supported font exists, otherwise an explicit warning.|renders/forty-output_01.png; S7-04-framing-final.png|
|F02|S6/S7|Minor|The very long surname is too small for comfortable print reading.|A useful minimum-size warning and an obvious route to enlarge the name box.|renders/forty-output_01.png|
|F03|S8|Minor|Import asks for a converted original baby PNG as well as the replacement portrait; the ZIP alone is not enough.|Explain that a config stores settings and references, not source image bytes.|S8-04-reupload.png; S8-05-import-result.png|
|F04|S5/S12|Minor|Many controls sit below the inspector fold and I have to scroll to find them.|Shorter grouped edit sections.|S8-06-restored-edits.png; S12-02-portrait-crop.png|
|F05|S9|Minor|Malformed extra-field CSV feedback says to resave, without identifying the row.|Row and column detail.|Earlier independent worker report; artifacts not retained. Fresh evidence requested separately.|
|F06|S7|Minor|Automatic preview starts on entering Generate and disables navigation; Cancel waits until the current rendering stage finishes.|Clearer preview start choice and cancellation feedback.|S7-01-cancel.png; S7-02-render-all.png|

## Scenario evidence and limits
- S1: licence, tour and tour dismissal captured.
- S2: bundled sample walked through all five steps; preview, Render all, PNG and ZIP downloaded. Sample spread saved under renders/sample.png.
- S3: sixteen synthetic slots parsed and one portrait box dragged; captured and visually inspected.
- S4: roster, portraits, quotes and baby ZIP imported. The project has forty people, twenty assigned baby photos, Chinese/emoji/one-word quotes, rejected/empty quotes and a first-page baby PDF conversion. The generator's original EXIF fixture had an incorrect tag/pixel combination; it was corrected in P3-00 and the final portrait was replaced through the UI.
- S5: first name edited to JosefineAA, lock/unlock reached, two portraits drag-swapped and mapping applied, one portrait replaced, crop zoom applied, baby rotate/centre/apply reached. Drawn-face detection did not find a face, with a readable message. Full live background removal is not claimed.
- S6: name and quote style sections exercised: color, italic, right/justify, vertical alignment, spacing, outline, shadow and name-fit/minimum controls. Name effects compared with real strip. Full font/axis/complex-script combinations were tested separately, not all visually walked here. Screens do not cover every possible parameter value.
- S7: cancelled preview and Render all, re-rendered three full-resolution spreads, downloaded all three PNGs, ZIP and XLSX. A render reload was reattached; its slow glyph fallback run was subsequently cancelled, then a fresh completed run used the cache fix. S10 complete in-flight resume is also covered by the browser regression suite, not inferred from this cancelled run.
- S8: config exported, double-confirmed Reset all, reimported annotated/clean template, roster, portraits ZIP, baby ZIP, missing replacement portrait and PDF-derived original. Edited name/size/color, spread-2 position, portrait focus and150dpi framing were restored. Config contains references, not image bytes.
- S10: baby rotated/applied, page reloaded, Reset to original reached and applied. Reset restores original source into the editor and creates a fitted crop on Apply, not a byte-identical original file. Same-step and second-browser behavior have dedicated regressions. Other step reloads have earlier captures; they are not a substitute for the final suite.
- S11: dark Template and default Style contrast checked, small People viewport captured. Earlier independent worker completed keyboard-only sample Render all + ZIP and dark headings on all five steps, but retained no keyboard/messy artifacts. Those are worker-reported, not our retained evidence. A fresh evidence run is pending.
- S12: per-person name31pt/#990000 and spread2/slot1 overrides inspected in actual output. Portrait focus1.4, ellipse3px border/shadow and150dpi verified in downloaded pixels/metadata. Add/duplicate/delete/undo/redo and safe-area overlay walked. Detection tuning, full bulk queue, filename column, complete renumber/pan/key-nudge and all baby/print parameter combinations are covered by focused tests, but not all have final walkthrough screenshots yet. This is a coverage gap, not an all-control acceptance claim.

## Scorecard
Scores are clarity / waiting / recovery / wording / polish, 1-5.
- Template: 4/4/4/4/4. Numbers and history help, but safe-area plus editor makes the page tall.
- Uploads: 4/4/4/4/4. Counts and skipped-file warnings are useful; malformed CSV needs a row number.
- People: 4/4/4/4/4. Name edits, source selection and overrides are available; inspector is long.
- Style: 4/3/4/4/4. Approximate caption is honest, real-render strip useful; many controls need scrolling.
- Generate: 4/3/4/4/4. Preflight and print size are clear; automatic preview can keep users waiting.

## Output check
Inspected all three saved spreads at2000px width: sixteen, sixteen and eight students, with no blank or duplicate roster entries. JoséAQ moved into the vacated first slot and JosefineAA appears in spread2/slot1 with the red31pt override. AnaAB's EXIF portrait is upright and1.4zoom is visible. Swapped Émile/Riley portraits reflect the intentional swap. All portraits are ellipses with border/shadow in the corrected F4 output. Names/quotes stay inside their intended regions; long surnames are very small. Chinese text prints; moon emoji is replaced with a question mark and a warning. Baby ellipses and rectangles match the synthetic guides. Full PNGs are4000x2600, metadata150.0124dpi (PNG's integer pixels/metre rounding); physical size label677.3x440.3mm. Three downloaded PNGs and ZIP/XLSX completed. PDF crop-mark and TIFF paths have backend tests; no final UI-export pixel claim for them yet.

## Before/after
|Baseline|Outcome|Evidence pair|
|---|---|---|
|B01 default quotes silent|Fixed|baseline/S2-06-render-all.png -> final/S2-06-render-confirm.png and S7-02-render-all.png|
|B02 fake Style quote|Improved|baseline/S2-04-style.png -> final/S6-02-real-strip.png. Approximate card still uses sample text, labelled as approximate.|
|B03 optional skips called errors|Improved|baseline/S4-01-import-warnings.png -> final/S4-02-processed.png. Malformed CSV remains generic.|
|B04 unnumbered tiny handles|Fixed|baseline/S3-02-detected.png -> final/S3-02-dragged.png and S12-04-layout-history.png|
|B05 name cannot be edited|Fixed|baseline/S5-02-inspector.png -> final/S5-01-name-locked.png and S8-06-restored-edits.png|
|B06 original reset lost after reload|Improved|baseline/S10-baby-reset-after-reload.png -> final/S10-05-reset-after-edit-reload.png. Original source is retained; Apply makes a fitted crop.|
|B07 lock has no recovery|Improved|baseline/S10-second-device.png -> regression p3-16-takeover. Live locks deliberately cannot be displaced; Try again works, stale/admin-enabled takeover only. Final screenshot pending.|
|B08 sideways EXIF|Baseline finding invalidated; final upright verified|baseline/renders/forty-output_01.png -> final/renders/forty-output_01.png. Baseline fixture tagged upright stored pixels as orientation6; do not attribute that image alone to a product bug. Correctly rotated raw-pixel tests and final corrected source verify EXIF handling.|
|B09 import has no initial focus|Fixed|baseline/S8-02-import-dialog.png -> final/S8-03-import.png; dialog-focus regressions.|
|B10 default quote looks owned|Fixed|baseline/S5-02-inspector.png -> final/S8-06-restored-edits.png; explicit no-quote control and default placeholder.|

## Ideas
1. Ask before automatic preview begins on Generate.
2. Put the source-file checklist beside config export.
3. Name malformed CSV rows/columns.
4. Add a direct enlarge-name-box link beside a minimum-size warning.
5. Collapse the per-person inspector into smaller edit sections.
6. Explain exactly what Reset to original will crop before applying.
7. Provide a tested, shipped Unicode/emoji font path instead of relying on system fonts.
