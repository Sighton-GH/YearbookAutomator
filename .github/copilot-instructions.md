# Yearbook Grad Mugshot Automator – Copilot instructions

## Big picture

- FastAPI backend entrypoint: [server/app/main.py](server/app/main.py) (routers in [server/app/routes/](server/app/routes/), core logic in [server/app/services/](server/app/services/)).
- React/Vite frontend: stepper UI in [web/src/App.tsx](web/src/App.tsx) calling typed API helpers in [web/src/api.ts](web/src/api.ts).
- API contracts: Pydantic models in [server/app/models/schemas.py](server/app/models/schemas.py) mirrored as TS types in [web/src/api.ts](web/src/api.ts) (backend uses `snake_case`).

## Licensing guard (important)

- Nearly all tool APIs are protected in [server/app/main.py](server/app/main.py): `/api/templates`, `/api/mapping`, `/api/generation`, `/api/fonts`, `/api/workspaces`.
- Frontend sends `X-License-Key` + `X-Device-Id` via an axios interceptor in [web/src/api.ts](web/src/api.ts).
- For endpoints fetched via `<img src>` (cannot send headers), backend accepts query params: `license_key|license|key` and `device_id`. Use the URL helpers: `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `generationDownloadUrl` in [web/src/api.ts](web/src/api.ts).

## Workspaces + on-disk layout

- All work is scoped by `workspace_id` and stored under `server/app/data/<workspace_id>/` (uploads, extracted images, masks, fonts, outputs).
- Use helpers in [server/app/services/storage.py](server/app/services/storage.py) (e.g. `validate_workspace_id`, `workspace_dir`, `save_upload`, `touch_workspace`, `request_end_session`).
- Default behavior wipes workspaces on server start; disable with `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false` (underscore folders like `server/app/data/_licenses` are preserved).
- Cleanup runs in a background thread (`cleanup_loop`) with TTL/grace env vars in [server/app/services/workspace_cleanup.py](server/app/services/workspace_cleanup.py).

## End-to-end API flow (what calls what)

- Templates: `POST /api/templates/parse` → `extract_slots` in [server/app/services/template_parser.py](server/app/services/template_parser.py).
  - Default guide colors: mugshot `#00bf63`, baby `#004aad`, name `#ff751f`, quote `#ff3131`.
  - Requires at least one name + quote box; `min_area` has a hard floor at 400; custom colors sweep HSV tolerance then fall back.
- Roster + mugshots: `POST /api/mapping/ingest` (multipart). Spreadsheet must have “first name” + “last name”.
  - Mugshot ZIP defaults to numeric filenames matching **1-based** row indices (pattern `\d{3,4}`), with optional advanced name matching.
- Review: `POST /api/mapping/review` with `keep|replace|shift|skip|remove` (shift cascades downward).
- Optional: `POST /api/mapping/upload-image`, `upload-baby-zip`, `upload-quotes-spreadsheet`; preview via `GET /api/mapping/asset`.
- Generation: `POST /api/generation/generate` runs in a background thread; progress is in-memory in [server/app/services/progress.py](server/app/services/progress.py) and polled via `GET /api/generation/status`.

## Fonts

- System fonts are enumerated in [server/app/services/fonts.py](server/app/services/fonts.py); per-workspace uploaded fonts under `fonts/` take priority.

## Dev workflow (Windows)

- Backend: `cd server` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`
- Frontend: `cd web` → `npm install` → `npm run dev` (Vite proxies `/api` to `http://127.0.0.1:8000`; see [web/vite.config.ts](web/vite.config.ts))
- Tests: `cd server` → `pytest` (examples in [server/tests/](server/tests/))
