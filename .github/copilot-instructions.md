# Yearbook Grad Mugshot Automator – Copilot notes

## Architecture & Data Flow

- **Backend entry**: FastAPI at [server/app/main.py](server/app/main.py) with routers in [server/app/routes](server/app/routes); core services in [server/app/services](server/app/services). Lifespan context starts workspace cleanup janitor thread and optionally clears workspaces on startup.
- **Frontend entry**: React/Vite stepper UI in [web/src/App.tsx](web/src/App.tsx) calls typed client in [web/src/api.ts](web/src/api.ts). Axios interceptor auto-injects `X-License-Key` + `X-Device-Id` headers from local storage.
- **Contracts**: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) mirrored to TypeScript types (snake_case from backend). Keep schemas synchronized when adding fields.

## Licensing & Security

- **Middleware protection**: Routes `/api/templates|/api/mapping|/api/generation|/api/fonts|/api/workspaces` require valid license key headers (`X-License-Key`, `X-Device-Id`). Errors return structured 401 with `detail/reason/hint` fields; frontend shows hints via `describeApiError` in [web/src/configFile.ts](web/src/configFile.ts).
- **Asset URLs**: Image downloads (`<img src>` or direct fetch) need query params `license_key|license|key` and `device_id`. Use helpers: `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `templateAnnotatedUrl`, `generationDownloadUrl` in [web/src/api.ts](web/src/api.ts).
- **Admin panel**: `/admin/licenses` (optional password `YMGA_LICENSE_ADMIN_PASSWORD`); displays last 500 usage events. Personal keys default to 5 uses/month (`YMGA_PERSONAL_MONTHLY_LIMIT`).
- **License storage**: Records in `server/app/data/_licenses/{licenses.json,usage.json,secret.txt}`. Secret derives keys; set `YMGA_LICENSE_SECRET` for stability across restarts. Override store with `YMGA_LICENSE_STORE_DIR` (tests use `tmp_path`).

## Workspace Storage

- **Layout**: Each workspace under `server/app/data/<workspace_id>/` holds: `template_clean.png`, `template_annotated.png`, `uploads/`, `mugshots/`, `baby/`, `fonts/`, `masks/baby/`, `generation/requests/*.json`, `output.{png|pdf|tiff}`, `meta.json`.
- **Validation**: IDs must match `[0-9A-Za-z_-]{3,64}` via `validate_workspace_id` in [server/app/services/storage.py](server/app/services/storage.py). Internal folders prefixed `_` (e.g., `_licenses`) persist across workspace wipes.
- **Cleanup**: Janitor thread in [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py) deletes workspaces after TTL (default 24h from `last_seen`, or 20s after `end_requested_at`). Configure via `YMGA_WORKSPACE_{GRACE_SECONDS|TTL_SECONDS|CLEANUP_INTERVAL_SECONDS}`. Active background jobs (`status ∉ {done,error}` updated within 5m) protect workspaces from deletion.
- **Startup wipe**: By default, all workspaces clear on server start (`YMGA_CLEAR_WORKSPACES_ON_STARTUP=true`). Disable for production.

## Template Parsing (OpenCV)

- **Endpoint**: `POST /api/templates/parse` → `extract_slots` in [server/app/services/template_parser.py](server/app/services/template_parser.py). Upload annotated + clean templates; backend detects colored boxes via HSV with tolerance sweeps (20→32→40→48) until boxes found.
- **Colors**: Mugshot green `#00bf63`, baby blue `#004aad`, name orange `#ff751f`, quote red `#ff3131`. Requires ≥1 name and ≥1 quote box; baby/quote can be disabled via flags.
- **Grouping**: Groups overlapping Y-ranges top→bottom, then left→right into `TemplateSlots` (one per student). Scales boxes if clean template differs in size. Saves baby masks as PNG with alpha channel in `masks/baby/{slot_index}.png`.
- **Min area**: Boxes < 400 px² ignored to avoid false detections. Synthetic test images in [server/tests/test_template_parser.py](server/tests/test_template_parser.py) use BGR rectangles (cv2 convention).

## Spreadsheet + Mapping

- **Ingest**: `POST /api/mapping/ingest` accepts Excel/CSV roster + portrait ZIP. Numeric filenames (`\d{3,4}`) map to **1-based** rows. Requires `first_name`, `last_name` headers (case-insensitive). Returns `SpreadsheetPreview` with warnings.
- **Review actions**: `POST /api/mapping/review` supports `keep|replace|shift|skip|remove`. Shift/skip cascade assignments downward (for missing portraits). Backend reloads people JSON after edits.
- **Face detection**: `POST /api/mapping/detect-face-center` uses OpenCV Haar cascades (falls back to image center if no face). Used to center mugshots in slots.
- **Background removal**: Preview jobs run in thread ([server/app/services/background_jobs.py](server/app/services/background_jobs.py)); poll `/api/mapping/remove-background-preview-status` for `{progress,status,message,error,eta_seconds}`. Fetch result image via `/api/mapping/remove-background-preview-result`. Enable verbose logging with `YMGA_REMBG_VERBOSE=1`.

## Generation Pipeline

- **Job flow**: `POST /api/generation/generate` starts background thread; progress tracked in-memory ([server/app/services/progress.py](server/app/services/progress.py)) and polled via `/api/generation/status`. Request JSON persisted to `generation/requests/<timestamp>.json`.
- **Rendering**: [server/app/services/generator.py](server/app/services/generator.py) crops/masks/places images, renders text via Pillow. Placement order determined by [server/app/services/placement.py](server/app/services/placement.py) (top→bottom, left→right).
- **Fonts**: Resolver in [server/app/services/fonts.py](server/app/services/fonts.py) checks uploaded fonts (`<workspace>/fonts/`), then system fonts, then Pillow defaults (DejaVuSans). Frontend font picker in [web/src/components/FontPick.tsx](web/src/components/FontPick.tsx) uses CSS font stacks (e.g., `"Georgia"` or `Inter, system-ui, sans-serif`).
- **Output formats**: Supports `png|pdf|tiff` via `output_format` field. Multi-page spreads use TIFF layers or separate files (ZIP download). Usage counting controlled by `count_usage` flag (true for "Render All", false for preview).

## Frontend Patterns

- **State management**: Stepper state (`currentStep`, `people`, `styling`, etc.) lives in [web/src/App.tsx](web/src/App.tsx) (2284 lines). License/device ID cached via [web/src/licensing.ts](web/src/licensing.ts); workspace ID via [web/src/session.ts](web/src/session.ts).
- **Config import/export**: [web/src/configFile.ts](web/src/configFile.ts) defines `ConfigFileV1<TSession>` schema. Backend is **unaware** of configs; [web/src/configImport.ts](web/src/configImport.ts) reconstructs workspace by uploading assets sequentially. Missing assets tracked via `computeMissingAssets`.
- **Step components**: Individual steps in [web/src/steps/](web/src/steps/) (e.g., `TemplateParsing.tsx`, `MugshotMapping.tsx`). Shared components in [web/src/components/](web/src/components/) (ProgressBar, SlotEditor, ToolMessages).
- **Error handling**: Use `describeApiError(err, fallback)` to extract structured error messages from 401/400 responses; shows `reason` + `hint` if available.

## Testing

- **Unit tests**: [server/tests](server/tests) cover slot grouping (`test_template_parser.py`), placement order (`test_placement_order.py`), background removal (`test_background_removal.py`), fonts (`test_generator_fonts.py`), baby matching (`test_baby_partial_matching.py`), and edge cases (invalid images, wrapping).
- **Mocking storage**: Use `monkeypatch.setattr(storage_mod, "BASE_DATA", tmp_path / "data")` to isolate test workspaces. License tests monkeypatch `YMGA_LICENSE_STORE_DIR` and `YMGA_LICENSE_SECRET`.
- **Synthetic templates**: Generate BGR images via cv2 (`np.ones(..., dtype=np.uint8) * 255`) with colored rectangles; encode to PNG via `cv2.imencode(".png", img).tobytes()`.
- **Run tests**: `cd server && pytest` (or activate venv first: `.venv\Scripts\activate && pytest`).

## Dev Workflow (Windows)

1. **Backend**: `cd server && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`. API docs at `/docs`, health at `/health`.
2. **Frontend**: `cd web && npm install && npm run dev`. Runs at http://localhost:5173 with `/api` proxy to backend (see [web/vite.config.ts](web/vite.config.ts)).
3. **Build**: `cd web && npm run build` → outputs to `web/dist/`.
4. **Env vars**: Set via shell or `.env` (backend auto-loads from `server/.env` if present). Common vars: `YMGA_CLEAR_WORKSPACES_ON_STARTUP`, `YMGA_LICENSE_SECRET`, `YMGA_LICENSE_ADMIN_PASSWORD`, `YMGA_WORKSPACE_TTL_SECONDS`.

## Common Pitfalls

- **Parsing failures**: Template needs clear colored boxes (min 400 px²); tolerance sweeps may fail if colors are off-spec or blurred. Check `raw_debug` in response to see detected box counts.
- **Ingest errors**: Roster must have `first_name`/`last_name` headers; portrait filenames must be numeric or match roster indices. Non-numeric names trigger warnings.
- **Generation requires**: Parsed template + mapped people with valid mugshots. Missing data → backend returns 400.
- **Licensing 401s**: Check browser console for missing headers; ensure `getStoredLicenseKey()` returns valid key. Admin panel shows key status/usage.
- **Workspace wiped**: If `YMGA_CLEAR_WORKSPACES_ON_STARTUP=true` (default), uploads lost on restart. Disable for persistent testing.
- **Font resolution**: If custom font doesn't apply, check upload succeeded (`/api/fonts/list`) and name matches CSS stack. Pillow falls back to DejaVuSans if unresolved.
