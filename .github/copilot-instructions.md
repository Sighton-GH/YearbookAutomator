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
- Detects mugshot/baby/name/quote regions by colour, groups into per-student slots, saves baby-mask cutouts.
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
- No integration tests; unit tests focus on: slot grouping, matching algorithms, font fallback chains.
- Color detection tests use OpenCV to create synthetic annotated templates with precise BGR values.

## Error handling patterns

- Backend raises `InvalidWorkspaceId` (caught globally, returns 400) for invalid workspace IDs.
- License errors return 401 with structured JSON: `{"detail": "...", "reason": "...", "hint": "..."}`.
- Image/file validation: raise `HTTPException(400)` with actionable messages for users.
- Background removal wraps exceptions from rembg/PIL with user-friendly error details.
