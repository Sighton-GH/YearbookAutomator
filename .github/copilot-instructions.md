# Yearbook Grad Mugshot Automator – Copilot instructions

## Repo map (start here)

- **Backend**: FastAPI app in [server/app/main.py](server/app/main.py); routers in [server/app/routes/](server/app/routes/); core logic in [server/app/services/](server/app/services/).
- **Frontend**: React/Vite stepper in [web/src/App.tsx](web/src/App.tsx) calling a typed axios client in [web/src/api.ts](web/src/api.ts).
- **API contracts**: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) mirrored as TS types; backend fields are `snake_case`.

## Licensing guard (do not bypass)

- Middleware in [server/app/main.py](server/app/main.py) protects: `/api/templates|/api/mapping|/api/generation|/api/fonts|/api/workspaces`.
- Normal API calls: axios interceptor sends `X-License-Key` + `X-Device-Id` ([web/src/api.ts](web/src/api.ts)).
- `<img src>`/downloads can't send headers: backend accepts query params `license_key|license|key` and `device_id`. Use URL helpers in [web/src/api.ts](web/src/api.ts): `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `templateAnnotatedUrl`, `generationDownloadUrl`.
- License admin: `/admin/licenses` (password via `YMGA_LICENSE_ADMIN_PASSWORD`); persisted under `server/app/data/_licenses/`.

## Workspace-first storage model

- Everything scoped by `workspace_id` under `server/app/data/<workspace_id>/`.
- Use [server/app/services/storage.py](server/app/services/storage.py) helpers: `validate_workspace_id` (pattern `[0-9A-Za-z_-]{3,64}`), `workspace_dir`, `save_upload`, `touch_workspace`, `request_end_session`.
- Server startup wipes workspaces by default; disable with `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false` (underscore folders like `_licenses` preserved).
- Cleanup janitor thread (started in lifespan) deletes idle workspaces via `meta.json` (`last_seen`, `end_requested_at`); tune with `YMGA_WORKSPACE_*` env vars in [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py).

## Key API patterns & data flows

**Template parsing:**
- `POST /api/templates/parse` → `extract_slots()` in [server/app/services/template_parser.py](server/app/services/template_parser.py).
- Detects mugshot/baby/name/quote regions by colour via OpenCV HSV thresholding: green (`#00bf63`), blue (`#004aad`), orange (`#ff751f`), red (`#ff3131`).
- Tolerance sweeps: starts at `tol=20`, retries with increasing tolerance (32, 40, 48) until boxes found or gives up.
- Groups boxes by proximity (top-to-bottom, left-to-right) into per-student slots; requires ≥1 name + ≥1 quote box.
- Saves baby-mask cutouts as PNGs; auto-scales coordinates if clean template dimensions differ from annotated.
- Reuse: if `workspace_id` provided and files omitted, [server/app/routes/templates.py](server/app/routes/templates.py) loads saved templates.

**Spreadsheet + mapping:**
- `POST /api/mapping/ingest` saves spreadsheet + portrait ZIP for reuse.
- Default numeric mugshot filenames (`\d{3,4}`) match **1-based** row indices.
- `POST /api/mapping/review` applies decisions: `keep|replace|shift|skip|remove`; **`shift`/`skip` cascade downward**.

**Background removal (async preview):**
- Runs in background thread via [server/app/services/background_jobs.py](server/app/services/background_jobs.py).
- Tracks: `progress`, `status`, `message`, `error`, `result_bytes` (for in-memory preview), `eta_seconds`.
- Status polled via `GET /api/mapping/remove-background-preview-status`; preview fetched via `GET /api/mapping/remove-background-preview-result`.

**Generation (async):**
- `POST /api/generation/generate` spawns background thread; progress in-memory ([server/app/services/progress.py](server/app/services/progress.py)).
- Status polled via `GET /api/generation/status`.
- Persists request under `server/app/data/<workspace_id>/generation/requests/*.json` (enables later export).
- Fonts resolved by [server/app/services/generator.py](server/app/services/generator.py): uploaded files first, then system/Pillow fallbacks.

## Dev workflow (Windows)

**Backend:**
```sh
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- Default port: `8000`; backend accessible at `http://127.0.0.1:8000`
- Docs: `http://127.0.0.1:8000/docs` (OpenAPI/Swagger)
- Health check: `http://127.0.0.1:8000/health`

**Frontend:**
```sh
cd web
npm install
npm run dev  # Vite proxies /api to http://127.0.0.1:8000
```
- Runs at `http://localhost:5173`; Vite proxy configured in [vite.config.ts](../web/vite.config.ts)

**Tests:**
```sh
cd server
pytest
```
- No integration tests; focused on unit testing core algorithms

## Testing patterns

- Use pytest fixtures; workspace tests mock `BASE_DATA` via `monkeypatch`.
- Background removal, generator, font tests in `server/tests/test_*.py`.
- No integration tests; unit tests focus on: slot grouping, matching algorithms, font fallback chains, color detection with synthetic images.
- Color detection tests use OpenCV to create synthetic annotated templates with precise BGR values.
- Test color tolerance sweeps: verify parser retries with increasing tolerance when boxes not found initially.
- Font tests verify fallback chain: uploaded → system → Pillow defaults (DejaVuSans).

## Key dependencies & algorithms

**Backend:**
- OpenCV (`opencv-python`): HSV color detection, contour finding for template parsing.
- Pillow (`pillow`): image composition, font rendering, format conversion.
- rembg (`rembg`): ML-based background removal (U2-Net model).
- pandas/openpyxl: spreadsheet ingestion (.xlsx/.csv).
- fonttools: font file validation and metadata extraction.

**Frontend:**
- react-easy-crop: mugshot cropping UI with zoom/pan.
- axios: HTTP client with interceptors for license headers.
- zustand: lightweight state management (not heavily used; mostly component state).
- clsx: conditional class name utility.

**Color detection specifics:**
- HSV ranges: Hue ±`tol`, Saturation/Value ±`tol*2`.
- Min area threshold: 400px² (prevents false positives from noise).
- Deduplication: merges overlapping boxes within 10px tolerance.

## Error handling patterns

- Backend raises `InvalidWorkspaceId` (caught globally, returns 400) for invalid workspace IDs.
- License errors return 401 with structured JSON: `{"detail": "...", "reason": "...", "hint": "..."}`.
- Image/file validation: raise `HTTPException(400)` with actionable messages for users.
- Background removal wraps exceptions from rembg/PIL with user-friendly error details.

## Environment variables reference

**Licensing:**
- `YMGA_LICENSE_SECRET`: Secret for key generation (persisted to `secret.txt` if unset).
- `YMGA_LICENSE_STORE_DIR`: Override license storage location (default: `server/app/data/_licenses`).
- `YMGA_LICENSE_ADMIN_PASSWORD`: Password for `/admin/licenses` panel (open access if unset).
- `YMGA_PERSONAL_MONTHLY_LIMIT`: Monthly usage limit for personal keys (default: `5`).

**Workspace cleanup:**
- `YMGA_CLEAR_WORKSPACES_ON_STARTUP`: Wipe workspaces on server start (default: `true`).
- `YMGA_WORKSPACE_GRACE_SECONDS`: Buffer before cleanup eligibility (default: `20`).
- `YMGA_WORKSPACE_TTL_SECONDS`: Max idle time before deletion (default: `86400` = 24h).
- `YMGA_WORKSPACE_CLEANUP_INTERVAL_SECONDS`: Janitor check frequency (default: `60`).
- `YMGA_WORKSPACE_ACTIVE_JOB_WINDOW_SECONDS`: Active job grace period (default: `300` = 5m).

## Config file import/export

- Users can export entire workspace state as JSON via [web/src/configFile.ts](web/src/configFile.ts) → `ConfigFileV1`.
- Import flow: upload config JSON → detect missing assets (templates/images) → upload them → auto-restore session.
- Enables: session resumption, sharing setups, debugging by exporting exact state.
- Backend doesn't know about configs; frontend orchestrates via normal API calls.

## Frontend state management

- React component state drives UI; minimal use of zustand.
- Workspace session state (`workspace_id`, uploaded files, parsed slots) stored in-memory + via API calls.
- License key + device ID persisted to `localStorage` ([web/src/licensing.ts](web/src/licensing.ts)).
- No Redux/complex store; stepper flow is mostly unidirectional with API-backed state.

## Additional services

**Face detection:**
- `POST /api/mapping/detect-face-center`: finds face center for crop previews (optional feature).
- Uses OpenCV Haar cascades; returns `{found, center_x, center_y}`.

**Font handling:**
- Upload custom fonts or rely on system fonts + Pillow defaults (DejaVuSans).
- Fallback chain: uploaded → system → DejaVuSans (see [server/app/services/fonts.py](server/app/services/fonts.py)).
- Font metadata validated via `fonttools`.
