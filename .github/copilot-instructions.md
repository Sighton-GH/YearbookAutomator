# Yearbook Grad Mugshot Automator – Copilot instructions

## Repo map (start here)

- Backend: FastAPI app in [server/app/main.py](server/app/main.py); routers in [server/app/routes/](server/app/routes/); core logic in [server/app/services/](server/app/services/).
- Frontend: React/Vite stepper in [web/src/App.tsx](web/src/App.tsx) calling a typed axios client in [web/src/api.ts](web/src/api.ts).
- API contracts: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) mirrored as TS types; backend fields are `snake_case`.

## Licensing guard (do not bypass)

- Middleware in [server/app/main.py](server/app/main.py) protects: `/api/templates|/api/mapping|/api/generation|/api/fonts|/api/workspaces`.
- Normal API calls: axios interceptor sends `X-License-Key` + `X-Device-Id` ([web/src/api.ts](web/src/api.ts)).
- `<img src>`/downloads can’t send headers: backend accepts query params `license_key|license|key` and `device_id` (see middleware). Use URL helpers in [web/src/api.ts](web/src/api.ts): `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `templateAnnotatedUrl`, `generationDownloadUrl`.
- License admin UI: `/admin/licenses` (password via `YMGA_LICENSE_ADMIN_PASSWORD`); persisted under `server/app/data/_licenses/` (see [README.md](README.md)).

## Workspace-first storage model

- Everything is scoped by `workspace_id` and stored under `server/app/data/<workspace_id>/`.
- Use [server/app/services/storage.py](server/app/services/storage.py) helpers: `validate_workspace_id` (`[0-9A-Za-z_-]{3,64}`), `workspace_dir`, `save_upload`, `touch_workspace`, `request_end_session`.
- Server startup wipes workspaces by default; disable with `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false` (underscore folders like `server/app/data/_licenses` are preserved).
- Cleanup janitor thread deletes ended/idle workspaces using `meta.json` (`last_seen`, `end_requested_at`) and job activity; tune with `YMGA_WORKSPACE_*` in [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py).

## End-to-end API flow (what calls what)

- Template parse: `POST /api/templates/parse` → `extract_slots` in [server/app/services/template_parser.py](server/app/services/template_parser.py) (default guide colors + `min_area`).
- Template reuse: if `workspace_id` is provided and files are omitted, [server/app/routes/templates.py](server/app/routes/templates.py) loads the saved templates.
- Spreadsheet+mugshots ingest: `POST /api/mapping/ingest` saves uploads for reuse; defaults to numeric mugshot filenames (`\d{3,4}`) matching **1-based** row indices (see [server/app/routes/mapping.py](server/app/routes/mapping.py)).
- Mapping review: `POST /api/mapping/review` applies `keep|replace|shift|skip|remove`; `shift/skip` cascade downward.
- Generation: `POST /api/generation/generate` runs in a background thread; progress is tracked in-memory and polled via `GET /api/generation/status` (see [server/app/services/progress.py](server/app/services/progress.py)).
  - Generation persists the exact request under `server/app/data/<workspace_id>/generation/requests/*.json` for later export/download (see [server/app/routes/generation.py](server/app/routes/generation.py)).

## Dev workflow (Windows)

- Backend: `cd server` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`
- Frontend: `cd web` → `npm install` → `npm run dev` (Vite proxies `/api` to backend; see [web/vite.config.ts](web/vite.config.ts))
- Tests: `cd server` → `pytest`
