# Yearbook Grad Mugshot Automator – Copilot instructions

## Big picture
- FastAPI backend in [../server/app/main.py](../server/app/main.py); routers in [../server/app/routes](../server/app/routes) call services in [../server/app/services](../server/app/services).
- React/Vite frontend is a stepper in [../web/src/App.tsx](../web/src/App.tsx) calling the typed client in [../web/src/api.ts](../web/src/api.ts).
- API contracts are Pydantic models in [../server/app/models/schemas.py](../server/app/models/schemas.py); keep TypeScript types in sync (snake_case fields).

## Critical workflows (Windows)
- Backend uses Python 3.12 (avoid 3.13+). Start: `cd server; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
- Frontend dev server: `cd web; npm install; npm run dev` (Vite proxies `/api` to backend; see [../web/vite.config.ts](../web/vite.config.ts)).
- Tests: `cd server; pytest` (see [../server/tests](../server/tests)).

## Project-specific patterns
- **Licensing**: Protected routes require `X-License-Key` + `X-Device-Id` headers; 401s include `detail/reason/hint`. Frontend surfaces via `describeApiError` in [../web/src/configFile.ts](../web/src/configFile.ts). Asset URLs must include `license_key|license|key` and `device_id` params; use helpers in [../web/src/api.ts](../web/src/api.ts).
- **Workspace storage**: Each workspace lives under `server/app/data/<workspace_id>/` with `template_clean.png`, `template_annotated.png`, `mugshots/`, `baby/`, `fonts/`, `masks/baby/`, `generation/requests/*.json`, `output.{png|pdf|tiff}`, `meta.json`. ID validation is in [../server/app/services/storage.py](../server/app/services/storage.py). Cleanup janitor runs from lifespan in [../server/app/main.py](../server/app/main.py) and TTL settings live in [../server/app/services/workspace_cleanup.py](../server/app/services/workspace_cleanup.py).
- **Template parsing**: `POST /api/templates/parse` → `extract_slots` in [../server/app/services/template_parser.py](../server/app/services/template_parser.py). HSV tolerance sweeps (20→32→40→48), min box area 400 px², required name+quote boxes. Saves baby masks to `masks/baby/{slot_index}.png`.
- **Mapping**: `/api/mapping/ingest` expects `first_name`/`last_name` headers and numeric filenames mapping to **1-based** rows. Review actions `keep|replace|shift|skip|remove` in [../server/app/services/mapping_review.py](../server/app/services/mapping_review.py).
- **Generation**: `/api/generation/generate` runs background thread; progress is in-memory via [../server/app/services/progress.py](../server/app/services/progress.py). Placement order is top→bottom, left→right in [../server/app/services/placement.py](../server/app/services/placement.py).
- **Fonts**: Backend resolves uploaded fonts first (`<workspace>/fonts/`), then system fonts, then Pillow default in [../server/app/services/fonts.py](../server/app/services/fonts.py). Frontend uses CSS font stacks in [../web/src/components/FontPick.tsx](../web/src/components/FontPick.tsx).

## Tests & fixtures
- Template parsing tests use OpenCV BGR rectangles and `cv2.imencode` in [../server/tests/test_template_parser.py](../server/tests/test_template_parser.py).
- Storage isolation in tests uses `monkeypatch.setattr(storage_mod, "BASE_DATA", tmp_path / "data")` (see [../server/tests/test_storage.py](../server/tests/test_storage.py)).

## Common gotchas
- Default startup wipes workspaces (`YMGA_CLEAR_WORKSPACES_ON_STARTUP=true`).
- Missing `first_name`/`last_name` or non-numeric portrait filenames trigger ingest warnings.
- Custom fonts must be uploaded and name must match the CSS stack; otherwise Pillow falls back.
