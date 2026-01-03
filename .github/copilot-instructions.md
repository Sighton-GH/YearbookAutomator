# Yearbook Grad Mugshot Automator – Copilot instructions

## Big picture

- **Backend**: FastAPI app in [server/app/main.py](server/app/main.py) mounts routers in [server/app/routes/](server/app/routes/) (templates/mapping/generation/fonts/workspaces). Core logic lives in [server/app/services/](server/app/services/).
- **Frontend**: React/Vite stepper UI in [web/src/App.tsx](web/src/App.tsx) calls the backend through typed helpers in [web/src/api.ts](web/src/api.ts).
- **Contracts**: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) are mirrored by TS types in [web/src/api.ts](web/src/api.ts). Keep field names compatible (API uses snake_case).

## Workspace + storage (local disk)

- Each request is scoped by `workspace_id`. Workspace data lives under `server/app/data/<workspace_id>/` (uploads, extracted images, masks, fonts, outputs).
- Use [server/app/services/storage.py](server/app/services/storage.py) helpers (`workspace_dir`, `save_upload`, `touch_workspace`, `request_end_session`) and validate IDs with `validate_workspace_id`.
- Frontend keeps workspaces alive via `POST /api/workspaces/touch` while a tab is open; `POST /api/workspaces/end-session` requests cleanup.
- **Startup behavior**: on server start, workspaces are wiped by default; disable with `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false` (see [server/app/main.py](server/app/main.py)).
- **Cleanup behavior**: a background janitor thread removes workspaces after an end-session grace period and/or idle TTL (env overrides in [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py): `YMGA_WORKSPACE_GRACE_SECONDS`, `YMGA_WORKSPACE_TTL_SECONDS`, etc.). It skips workspaces with active generation jobs.

## End-to-end flow (API conventions)

- **Template parsing**: `POST /api/templates/parse` → `extract_slots` in [server/app/services/template_parser.py](server/app/services/template_parser.py).
	- Default colours: mugshot `#00bf63`, baby `#004aad`, name `#ff751f`, quote `#ff3131`.
	- **Required**: at least one name and quote box; min-area has a hard floor at 400; custom colours sweep HSV tolerance then fall back to defaults.
	- Saves `template_clean.png` + per-slot baby masks keyed by baby box coords; UI reads masks via `GET /api/mapping/baby-mask`.
- **Spreadsheet + mugshot ingest**: `POST /api/mapping/ingest` (multipart).
	- Spreadsheet requires “first name” + “last name” headers.
	- Mugshot ZIP: filenames are numeric by default (pattern `\d{3,4}`) and map to **1-based** row indices; optional advanced name matching tokenizes names and can shift numeric assignments.
- **Review**: `POST /api/mapping/review` applies `keep|replace|shift|skip` (shift cascades downward).
- **Optional overrides**: `POST /api/mapping/upload-image` (mugshot/baby), `POST /api/mapping/upload-baby-zip`, `POST /api/mapping/upload-quotes-spreadsheet`; preview files via `GET /api/mapping/asset`.
- **Generation**: `POST /api/generation/generate` runs in a background thread.
	- Progress lives in-memory in [server/app/services/progress.py](server/app/services/progress.py) and is polled via `GET /api/generation/status`.
	- Download: `GET /api/generation/download` (single) or `GET /api/generation/download-all` (zip of `output_*.png` if present).

## Fonts + assets

- System fonts enumerated in [server/app/services/fonts.py](server/app/services/fonts.py); uploaded fonts are per-workspace under `fonts/` and are preferred over system fallbacks.
- Frontend builds asset/mask/template URLs with helpers in [web/src/api.ts](web/src/api.ts) (`assetUrl`, `babyMaskUrl`, `templateCleanUrl`).

## Dev workflow (Windows-friendly)

- Backend: `cd server` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`
- Frontend: `cd web` → `npm install` → `npm run dev` (Vite proxies `/api` → `127.0.0.1:8000`)
- Tests: `cd server` → `pytest` (see [server/tests/](server/tests/) for patterns around template parsing, generation, progress, background removal)
