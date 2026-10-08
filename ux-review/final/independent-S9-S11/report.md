# Browser verification report: 0b62ed2d

Tested October 8, 2026. FICTIONAL SEEDED QA DATA ONLY.

## Result

S9 import-to-download is verified in a real local Chrome browser against the real backend. S11 five-step keyboard navigation, Render all and Download is verified in light and dark themes, with qualifications below. Accessibility is not a clean pass.

Both themes completed Render all with three spreads and downloaded spread 1. The two downloaded PNG files are byte-identical, 1000 x 650 pixels. Inspected the actual spread pixels: accented names render, the first-page baby-PDF image appears, and skipped/missing quotes use the visible default. One moon emoji is replaced with a question mark and is reported by the backend as an unavailable glyph. Long names can become very small in this seeded layout. No GPU inference or production print-quality claim.

## S11: keyboard and axe

Used Tab to locate controls and Enter to activate them. Export resolution was changed with ArrowDown, Ctrl+A, typing and Tab. Traversed Template -> Uploads -> People -> Style -> Generate in light, then the same five steps in dark. Render all, missing-content confirmation and individual Download were activated by keyboard in both themes.

File selection was supplied through Playwright, and the fictional license was filled programmatically. Native OS file-picker completion was not tested. Canvas manipulation, screen readers and every optional control were not tested. These limits mean this is keyboard-only navigation/render/download evidence, not a full keyboard-only project-creation certification.

| Step | Light serious/critical | Dark serious/critical |
|---|---|---|
| Template, parsed review | color-contrast: 4 nodes | color-contrast: 1 node |
| Uploads | none | none |
| People | none | none |
| Style | none | none |
| Generate, idle/populated | none | none |

An extra initial Template upload scan found two **critical unnamed file inputs**, plus four serious color-contrast nodes. The issue is on Template's upload screen, not the named Uploads inputs observed in this revision.

All ten five-step scans also found moderate `landmark-one-main`, `page-has-heading-one`, and `region` issues. Axe incomplete checks are retained in each JSON and must not be interpreted as passes.

Specific contrast evidence:
- Light Template tips: foreground #79848c / background #eff4f3, ratio 3.44:1. The tips title, pause button and tip body fail 4.5:1.
- Light Template active tab: about 3.35:1, below 4.5:1.
- Dark Template active chip: #e8eef2 / #2dd4bf, 1.59:1, below 4.5:1.

The earlier orientation report's dark Style contrast and unnamed Uploads inputs were **not reproduced** in these scans. Do not convert that absence into a general accessibility pass. Initial Template inputs still fail labeling.

## S9: messy import

Fixture roster: cp1252 CSV, 40 fictional students, accented names, one blank row, and two final duplicate names that differ only in case (`DUPLICATE Seeded`, `duplicate SEEDED`). The importer returned exactly 40 records and kept those two duplicates as separate indexed people with 039.jpg and 040.jpg. The blank row did not become a person. Accented names were preserved in API records and the downloaded spread.

Portrait archive: 40 valid numbered portraits, a metadata entry and corrupt.jpg. Ingest succeeded. It reported corrupt.jpg as skipped because its name did not match a roster name or numbered filename pattern. **This proves tolerant handling of an unmatched corrupt entry; it does not prove image-decoder recovery for corruption in a matched portrait.** All 40 imported records had a portrait filename.

Quote spreadsheet: a normal quote, CJK text, an emoji, an invalid link, `REJECTED`, an empty quote, ordinary fictional quotes and two missing rows. Quotes import succeeded with three explicit warnings: link/email skipped, placeholder skipped, empty cell. Generate reported five default/missing quotes and two skipped quotes. The long quote/name rendering and unavailable emoji glyph remain output-quality caveats, not import failures.

Baby archive: the two-page PDF was converted to PNG with an explicit warning: first page used, two pages total. Its image appears in the downloaded spread. Other name matching produced a partial-match warning and a multiple-files-for-one-person warning. The final render reported 21 missing baby photos, using the default. This fixture does not establish perfect fuzzy matching, and the warning itself deserves review before a real-school batch.

Malformed extra-field CSV:

```
First Name,Last Name
Seeded,Person
Too,Many,Fields
```

The browser submitted it through Ingest roster. The backend returned HTTP 400. The page displayed:

> Could not read the roster spreadsheet. Save it as .xlsx or .csv and try again.

Rejection is verified, but the error is generic: it does not identify the extra-field row or expected column count. Screenshot and visible text are retained.

## Environment and scope

Exact commit: 0b62ed2d9240e80145457af50188e4dc5d1e169e. Source: https://github.com/Sighton-GH/YearbookAutomator. Bundle chain applied in the supplied order. No tracked source changes, pushes or PRs. The evidence harness lives outside the source tree.

Real FastAPI/Uvicorn and Vite processes on loopback; no API mocks. Google Chrome 154.0.8037.57, Linux, Python 3.12.14, 1440 x 1000 browser viewport. Core render/import dependencies installed; optional ONNX/retinaface/rembg GPU paths not installed or exercised. Portrait face-centering and background-removal options left off.

Full-resolution auto-preview completed during the flow, but retained Render all downloads were set to 1000 x 650. Full-resolution Render all, PDF/TIFF exports, production deployment, GPU face detection, background removal, alternate browsers, mobile and native OS picker use were not verified.

Early setup attempts encountered a transient local process shutdown and a reused fictional-license workspace lock. Those attempts were restarted with isolated fictional licenses. The final retained run has only the deliberately induced malformed-CSV HTTP 400; no 5xx response in its capture. Intermediate failed screenshots are not part of the delivered evidence pack.

## Evidence index

See README.md for file descriptions, axe-summary.json for a compact scan index, the ten step screenshots for full-size evidence, step-contact-sheet.png for orientation, light/dark-rendered.png for the completed three-spread state, light/dark-output_01.png for browser downloads, and malformed-error.png for the error check. provenance.json records exact commit and fixture hashes. Selected non-licensing API responses are retained in responses.json. The full browser trace stays local because it includes license-entry activity.
