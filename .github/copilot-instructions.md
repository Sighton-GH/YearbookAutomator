# Yearbook Grad Mugshot Automator – Copilot instructions

## Big picture
- FastAPI backend entry in [server/app/main.py](../server/app/main.py) with routers in [server/app/routes](../server/app/routes) delegating to services in [server/app/services](../server/app/services).
- React/Vite frontend is a stepper UI (tool flow) in [web/src/App.tsx](../web/src/App.tsx), calling the typed API client in [web/src/api.ts](../web/src/api.ts).
- API contracts are Pydantic models in [server/app/models/schemas.py](../server/app/models/schemas.py); keep TS types in sync (snake_case fields).

## Critical workflows (Windows)
- Backend uses Python 3.12 (avoid 3.13+). Start: `cd server; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
- Frontend dev server: `cd web; npm install; npm run dev` (Vite proxies `/api` → backend; see [web/vite.config.ts](../web/vite.config.ts)).
- Tests: `cd server; pytest` (see [server/tests](../server/tests)).

## Project-specific conventions
- **Licensing**: Protected routes require `X-License-Key` + `X-Device-Id` headers in [server/app/main.py](../server/app/main.py). Asset/image URLs must pass `license_key|license|key` + `device_id` via helpers in [web/src/api.ts](../web/src/api.ts). UI error messaging uses `describeApiError()` in [web/src/configFile.ts](../web/src/configFile.ts). Admin panel is `/admin/licenses` (see [README.md](../README.md)).
- **Workspace storage**: Each workspace is server/app/data/<workspace_id>/ with template assets, uploads, outputs, and meta. Validation in [server/app/services/storage.py](../server/app/services/storage.py). Cleanup janitor runs in [server/app/services/workspace_cleanup.py](../server/app/services/workspace_cleanup.py), started by [server/app/main.py](../server/app/main.py).
- **Template parsing**: `POST /api/templates/parse` → `extract_slots()` in [server/app/services/template_parser.py](../server/app/services/template_parser.py). HSV tolerance sweeps (defaults 20→24→32→40→48; custom 24→32→40→48→64), min box area floor 400 px², name+quote boxes required. Baby masks saved as `masks/baby/{x}_{y}_{w}_{h}.png` (coordinate keyed).
- **Mapping**: `/api/mapping/ingest` expects `first_name`/`last_name` headers and numeric filenames mapping to **1-based** rows. Review actions include `keep|replace|shift|shift_up|skip|remove` in [server/app/services/mapping_review.py](../server/app/services/mapping_review.py).
- **Generation**: `/api/generation/generate` runs background threads; progress is in-memory via [server/app/services/progress.py](../server/app/services/progress.py). Placement order is computed in [server/app/services/placement.py](../server/app/services/placement.py) (`left_then_right` vs `simultaneous`).
- **Fonts**: Backend resolves uploaded fonts first (<workspace>/fonts/), then system fonts, then Pillow default in [server/app/services/fonts.py](../server/app/services/fonts.py). Frontend uses CSS font stacks in [web/src/components/FontPick.tsx](../web/src/components/FontPick.tsx).

## Tests & fixtures
- Template parsing tests use OpenCV BGR rectangles and `cv2.imencode` in [server/tests/test_template_parser.py](../server/tests/test_template_parser.py).
- Storage tests override workspace root with `monkeypatch.setattr(storage_mod, "BASE_DATA", tmp_path / "data")` in [server/tests/test_storage.py](../server/tests/test_storage.py).

## Common gotchas
- Default startup wipes workspaces (`YMGA_CLEAR_WORKSPACES_ON_STARTUP=true`) in [server/app/main.py](../server/app/main.py).
- Missing `first_name`/`last_name` or non-numeric portrait filenames trigger ingest warnings.
- Custom fonts must be uploaded and the CSS stack name must match; otherwise Pillow falls back.
