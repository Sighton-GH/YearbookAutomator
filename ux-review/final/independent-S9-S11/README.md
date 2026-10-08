# Yearbook 0b62ed2d browser evidence

All roster names, portraits, quotes, licenses and workspaces in this test are fictional seeded QA data. No production workspace or user record was used.

Source: https://github.com/Sighton-GH/YearbookAutomator
Target: 0b62ed2d9240e80145457af50188e4dc5d1e169e
The five supplied bundles were applied in order. No tracked source edits, pushes or pull requests.

This is a local integration test: actual FastAPI/Uvicorn backend, Vite frontend and Google Chrome, driven with Playwright. API responses are real, not mocked. Test runtime is Python 3.12.14; default system Python 3.10 failed on re._parser and was not used for the successful test. Base URL is loopback, not a public deployment.

Artifacts:
- `axe-*.json`: axe-core findings including violations, incomplete checks and pass counts.
- `*-Template.png`, `*-Uploads.png`, `*-People.png`, `*-Style.png`, `*-Generate.png`: screenshots of all five steps in each theme.
- `interaction-log.txt`: keyboard actions used for navigation, render confirmation and download.
- `responses.json`: captured non-licensing API response data. Workspace identifiers refer only to isolated seeded data.
- `light-output_01.png`, `dark-output_01.png`: actual browser downloads of spread 1 at 1000 x 650 pixels.
- `malformed-error.png` and `malformed-visible.txt`: malformed CSV UI outcome.
- `provenance.json`: commit, clean tracked-source status, runtime versions and fixture hashes.

Limits: fixture selection uses Playwright file upload, not a tested native OS file dialog. License entry also uses programmatic fill. Navigation and buttons use Tab/Enter; export size uses keyboard. This is not a claim of full screen-reader coverage, canvas editing accessibility, native-dialog usability, GPU inference or print-production readiness. CPU-only rendering, face centering/background removal not exercised. Full-resolution Render all, PDF/TIFF output, alternate browsers and mobile are outside this retained evidence.

Browser trace was retained locally but is not distributed because it includes license-entry activity. Screenshot files are unaltered originals; the contact sheet is a scaled index.
