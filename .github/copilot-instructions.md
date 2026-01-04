# Yearbook Grad Mugshot Automator – Copilot instructions

## Repo map (start here)

- Backend: FastAPI app in [server/app/main.py](server/app/main.py) with routers in [server/app/routes/](server/app/routes/) and core logic in [server/app/services/](server/app/services/).
- Frontend: React/Vite stepper in [web/src/App.tsx](web/src/App.tsx) calling a typed axios client in [web/src/api.ts](web/src/api.ts).
- API contracts: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) mirrored as TS types (backend fields are `snake_case`).

## Licensing guard (do not bypass)

- Requests to `/api/templates|/api/mapping|/api/generation|/api/fonts|/api/workspaces` are protected by middleware in [server/app/main.py](server/app/main.py).
- Normal API calls: frontend sends `X-License-Key` + `X-Device-Id` via an axios interceptor in [web/src/api.ts](web/src/api.ts).
- `<img src>`/asset endpoints can’t send headers: the backend accepts query params `license_key|license|key` and `device_id` (see middleware in [server/app/main.py](server/app/main.py)). Use the URL helpers in [web/src/api.ts](web/src/api.ts) (e.g. `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `generationDownloadUrl`).

## Workspace-first storage model

- Everything is scoped by `workspace_id` and stored under `server/app/data/<workspace_id>/`.
- Use storage helpers in [server/app/services/storage.py](server/app/services/storage.py): `validate_workspace_id` (allows `[0-9A-Za-z_-]{3,64}`), `workspace_dir`, `save_upload`, `touch_workspace`, `request_end_session`.
- Server startup wipes workspaces by default (dev convenience). Disable with `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false`. Underscore folders like `server/app/data/_licenses` are preserved.
- Cleanup thread deletes old workspaces based on `meta.json` (`last_seen`, `end_requested_at`) and job activity; see [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py) and env vars `YMGA_WORKSPACE_*`.

## End-to-end API flow (what calls what)

- Template parse: `POST /api/templates/parse` → `extract_slots` in [server/app/services/template_parser.py](server/app/services/template_parser.py).
  - Default guide colors: mugshot `#00bf63`, baby `#004aad`, name `#ff751f`, quote `#ff3131`; `min_area` defaults to 400.
  - Can reuse saved templates: if `workspace_id` is provided and files are omitted, [server/app/routes/templates.py](server/app/routes/templates.py) loads `uploads/template_annotated.png` + `template_clean.png`.
- Spreadsheet+mugshots ingest: `POST /api/mapping/ingest` saves uploads for reuse and defaults to numeric mugshot filenames (regex `\d{3,4}`) matching **1-based** row indices; advanced name matching lives in [server/app/routes/mapping.py](server/app/routes/mapping.py).
- Mapping review: `POST /api/mapping/review` applies `keep|replace|shift|skip|remove` where `shift/skip` cascade downward.
- Generation: `POST /api/generation/generate` runs a background thread, updates in-memory progress in [server/app/services/progress.py](server/app/services/progress.py), and is polled via `GET /api/generation/status`.
  - Generation also persists the exact request under `server/app/data/<workspace_id>/generation/requests/*.json` for later export (see [server/app/routes/generation.py](server/app/routes/generation.py)).

## Dev workflow (Windows)

- Backend: `cd server` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`
- Frontend: `cd web` → `npm install` → `npm run dev` (Vite proxies `/api` to backend; see [web/vite.config.ts](web/vite.config.ts))
- Tests: `cd server` → `pytest`
