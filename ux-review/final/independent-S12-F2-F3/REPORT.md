# F2 / F3 browser evidence on 3f8fbc69

All people and photographs are seeded fictional data. Local Google Chrome headless, React/Vite frontend and actual FastAPI backend. No API mocking or direct state injection was used to perform controls. Generated PNGs were downloaded through the UI at 1000 × 650 and visually inspected. CPU ONNX runtime replaces the unavailable pinned GPU package in the test environment only. Face crop disabled for output speed. Repository unmodified during evidence capture.

## Results

| Control | Result | Evidence / visible output |
|---|---|---|
| Add student, optional portrait and quote | Worked | 04-added-student.png; 04-added-output.png. New Seeded Student and FICTIONAL ADDED STUDENT quote print on right page. Uploaded clean template as a distinctive blank portrait. |
| Exclude student / include again | Worked | 06-excluded.png and output: José omitted, subsequent students move up. Included again before 07 output, where José reappears. |
| Uploaded portrait picker / search | Worked | 05-assets.png and output: first portrait changes from green 001 to pink 008. |
| Uploaded baby picker / search | Worked | 05-assets-output.png: first baby changes from green portrait to pink Quinn portrait. |
| Bulk select all / select none | Select all worked; select none not verified | 07-bulk-clears-size.png. |
| Bulk clear quotes / clear babies | Worked | 07 output removes all quotes and all babies, including defaults. |
| Bulk name size | Worked | 07 output increases names from original size to 90 source pixels. |
| Bulk quote size / exclude / include | Not verified | No output proof yet. |
| Bulk centre faces / remove backgrounds / stop queue | Not verified | No real-backend rendered-output proof yet. Mocked repository tests are not counted. |
| Filename column choice / disable | UI ingest worked; output inspection unfinished | 16-filename-controls.png shows both 8/8 file matches. ReverseImage selected and re-ingested; 16-filename-reverse-output.png generated. Disabled filename matching and re-ingested; 16-filename-disabled-output.png generated. These last two need visual inspection before a pass. |
| Renumber | Worked for simultaneous placement | 12-renumber.png/output. Clicked second slot then first, applied order. Ana and José swap printed positions. Left-then-right placement intentionally sorts by position. |
| Zoom in | Worked | 09-zoom.png, 100% to 150%, actual canvas enlarged. This viewport control should not alter exported output. Zoom out/wheel/pinch not verified. |
| Pan | Worked | 10-pan.png. Space+drag visibly moves canvas without moving portrait geometry. Fit restores viewport. Export should be unchanged. |
| Nudge | Worked | 11-nudge.png/output: 20 Shift+Right nudges move first portrait 200 source pixels / 50 output pixels while name remains in place. Ordinary arrows not separately tested. |
| Regroup nearby slots | Defective | 13-regroup-before/after/output. Starting from 16 slots, duplicate selected slot (17), regroup with cap 16, confirm. Overlapping duplicate remains while last distant slot disappears. Ana and Émile portraits and names overlap in generated PNG. |
| Detection sensitivity | Worked | 14-detection-zero.png lacks muted-green first portrait and includes tiny green decoy; sensitivity 30 restores first portrait. |
| Minimum detected area | Worked | 14-detection-30-area2000.png removes 31×31 tiny decoy. 14-detection-output.png generated. Raw overlay actually displays detected regions. |
| Automatic sensitivity reset / color overrides / skip toggles | Not verified | Not all advanced settings exercised. |
| Cutout rectangle / ellipse / rounded | Defective printed mask sizing | 15-cutout-* images generated and inspected. Rectangle baby's pink image fully covers portrait. Ellipse visibly becomes a large oval over the portrait. Baby source box is 171×171 but portrait is 241×321; mask preview corresponds to selected baby box. Output shows chosen baby's fill occupying the portrait region, not just the baby region, after reparse/remap. This needs investigation; do not classify as fully working from preview alone. Auto/error/retry not verified. |

## Test limits and caution

Some first automation attempts ran before workspace hydration finished and were discarded. A later ingest triggered a slow automatic preview. Subsequent scenarios waited for hydration and used UI-generated output. Do not count failed automation scripts as product defects.

Screenshots are raw UI evidence; seeded fictional status is stated here rather than baked into every UI screenshot. Generated output files are actual downloads, not reconstructions.

Regroup fix patch is pending and must be delivered separately from this HEAD evidence.
