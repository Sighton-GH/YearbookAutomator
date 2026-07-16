# Conventions & known issues

## Conventions

- **API payloads are snake_case end-to-end.** Pydantic models on the backend, hand-mirrored TypeScript types on the frontend (no codegen) — don't introduce camelCase fields on the wire in either direction.
- **Backend tests never touch real workspace data.** They monkeypatch `storage.BASE_DATA` (and, for settings tests, `admin_settings._SETTINGS_DIR`/`_SETTINGS_PATH` directly — those are computed once at import time from `storage.BASE_DATA`, so patching `storage.BASE_DATA` alone after import doesn't retarget them) to a tmp directory. Follow this pattern for any new test.
- **Template-parser tests build synthetic images**, not fixture files — synthetic BGR arrays via OpenCV, encoded with `cv2.imencode`. Follow this pattern for new parser tests rather than committing binary test fixtures.
- **The four purely-static website pages stay free of client-side state.** `AboutPage.tsx`, `PricingPage.tsx`, `PrivacyPage.tsx`, `LicensePage.tsx` should ship zero client JS; only add a `client:load` directive on the Astro page if you're introducing real interactivity (as `DocumentationPage.tsx` already has).
- **Branding strings are fixed** — "Custom Flow Automator" (product) / "Sighton Yearbook Tools" (company/site). They drifted to ad-hoc alternatives once already; see [`06-website.md`](06-website.md#branding-strings-verbatim-dont-drift-from-these).
- **Reuse existing admin HTML helpers** (`app/routes/admin_ui.py`) rather than hand-rolling new markup/CSS for admin pages — see [`03-backend.md`](03-backend.md#the-admin-panel).
- **The baby-photo editor has exactly one implementation** — `tool/web/src/components/BabyPhotoEditor.tsx`. Don't reintroduce a second one.

## Known structural debt

Some files are intentionally large and central rather than accidentally bloated — this is documented, not a TODO:

| File | Approx. size | Role |
|---|---|---|
| `tool/web/src/App.tsx` | ~3,100 lines | The frontend state machine — see [`05-frontend.md`](05-frontend.md#apptsx--the-state-machine-root) |
| `tool/web/src/steps/ImportStep.tsx` | ~1,700 lines | All four upload "cards" (template/portraits/quotes/baby), parameterized by a `sections` prop |
| `tool/web/src/steps/edit/PeopleTab.tsx` | ~800 lines | The People-step grid + staged mapping adjustments |
| `tool/server/app/services/generator.py` | ~600+ lines | The rendering pipeline — fonts, text layout, image fit, baby masks, GPU/CPU cascades, all in one module |
| `tool/server/app/routes/mapping.py` | ~700+ lines | Route handlers *plus* filename/name-matching helper logic that arguably belongs in a service module |

**No refactor is in progress.** When touching these files, prefer surgical, scoped edits over drive-by restructuring unless the task is specifically about cleanup — the repo's `CODEBASE_ORGANIZATION_REPORT.md` (repo root) has a fuller phased-refactor proposal, but **its file paths and filenames predate this repo's `tool/`/`website/` split and two later frontend redesigns** (Import/Edit/Finalize, then the current 5-step roadmap this documentation describes) — it references files like `BabyPhotosStep.tsx`, `MugshotMapping.tsx`, and a `web/src/pages/DocumentationPage.tsx` that **no longer exist** under those names/locations in this codebase. Treat it as directional context on *why* these areas are complex, not as an accurate current file map.

## Known issues & gotchas

Specific footguns worth knowing before you touch the related code, found while writing this documentation:

- **Spreadsheet header matching is a literal substring check, not normalized.** `services/spreadsheet.py`'s `_find_name_columns` requires the lower-cased header to literally contain `"first name"` / `"last name"` (with a space). A header like `first_name` (underscore) or `FirstName` (no separator) does **not** match and ingest fails outright. If you're debugging a "spreadsheet ingest fails" report, check this first before suspecting anything more complex.
- **`GET /api/generation/download` returns HTTP `200` with `{"error": "file not found"}` in the body when the file is missing, not a `404`.** Any client/integration checking only the status code will treat a missing file as success — check the response body.
- **The YuNet "enable" toggle in `/admin/settings` doesn't actually gate anything.** `services/face_detection.py`'s detector selection only checks whether a `yunet_model_path` is configured — it never reads the `enable_yunet` setting flag the admin UI exposes. Worth fixing (either wire the flag in, or remove it from the settings UI) if you're in this area.
- **`services/tiff_layers.py` (`save_layered_tiff`, a Photoshop-friendly multi-page layered TIFF export) is not called from any route.** It's fully implemented but unwired — the `/generate` route's `tiff` output format only ever produces a flattened single-page TIFF via the normal `generator.py` path. If you need layered TIFF export, this module is most of the way there but needs a route to call it.
- **`_load_font`'s `font_weight` parameter is accepted but not actually used** to select a bold/italic variant — font weight is effectively decorative in the request payload today. Bold/italic styling would need explicit variant-file resolution added to `services/generator.py`.
- **GPU/OpenCL availability is cached at module load** in both `services/generator.py` and `services/template_parser.py` (separate module-level flags, not shared state) — changing `YMGA_RENDER_PREFER_GPU`/`YMGA_OPENCL` at runtime (e.g. via a config management tool) requires a process restart to take effect; the admin settings UI doesn't cover these two flags at all (they're env-only).
- **Lowering the backend process's OS priority (`YMGA_CPU_LOW_PRIORITY` / the admin "low priority" toggle) can't always be reversed at runtime.** On POSIX, raising niceness back down after it's been raised typically needs elevated permissions the running process doesn't have — disabling the toggle after enabling it may require a full backend restart to actually restore normal priority.
- **The website has two parallel copies of both legal documents** (`public/LICENSE` + `public/PRIVACY.md` as raw files, vs. `LicensePage.tsx` + `PrivacyPage.tsx` as rendered HTML) that have to be kept in sync by hand — see [`06-website.md`](06-website.md#static-legal-docs-vs-rendered-pages).
- **Website contact links use a placeholder address** (`mailto:your-contact@domain.com` in `PricingPage.tsx`/`PrivacyPage.tsx`/`LicensePage.tsx`) — looks unfinished, not intentional.
- **`website/src/styles/*.css` and `tool/web/src/styles/*.css` have diverged** since the original copy — see [`06-website.md`](06-website.md#files-duplicated-from-toolweb). Don't assume editing one updates the other; check both when changing shared visual language.
