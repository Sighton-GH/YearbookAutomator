# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first yearbook spread generator: FastAPI backend (`server/`) + React/Vite frontend (`web/`). Users upload an annotated template (coloured guide boxes), a clean template (background art), a roster spreadsheet, and ZIPs of portrait/baby photos; the backend detects layout slots by colour, matches people to images, and renders finished spread PNGs/PDFs/TIFFs.

## Commands

### Backend (Python 3.12 — avoid 3.13+)
```sh
cd server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```sh
cd web
npm install
npm run dev       # Vite dev server on :5173, proxies /api -> 127.0.0.1:8000
npm run build     # tsc && vite build
npm run lint       # eslint .
```

### Both at once
```sh
bash start-dev.sh
```

### Tests (backend only)
```sh
cd server
.venv/bin/python -m pytest                      # all tests
.venv/bin/python -m pytest tests/test_template_parser.py   # one file
.venv/bin/python -m pytest tests/test_template_parser.py::test_name -v  # one test
```
There is no frontend test suite — verify frontend changes by running the dev server and exercising the stepper UI in a browser.

### GPU / acceleration env vars
- `YMGA_REMBG_PROVIDER` — force a provider for background removal (e.g. `CUDAExecutionProvider`, `DmlExecutionProvider`).
- `YMGA_FACE_PROVIDER`, `YMGA_YUNET_BACKEND`, `YMGA_YUNET_TARGET` — face-detection backend selection.
- `YMGA_RENDER_PREFER_GPU`, `YMGA_OPENCL` — rendering pipeline GPU toggles.
- Verify ONNX providers with: `python -c "import onnxruntime; print(onnxruntime.get_available_providers())"`.

Most other runtime knobs (admin auth, license limits, workspace cleanup/session timers) are `YMGA_*` env vars read in `server/app/services/*` — grep `os.getenv` in `server/app` before assuming a behavior is hardcoded.

## Architecture

### Backend: routes delegate to services
`server/app/main.py` wires FastAPI routers from `server/app/routes/*.py` under `/api/<domain>`; each route module should stay thin (HTTP parsing/validation) and call into `server/app/services/*.py` for actual logic. Shared Pydantic contracts live in `server/app/models/schemas.py` (snake_case fields — keep `web/src/types.ts` in sync manually, there is no codegen).

Three middleware layers run on every request, in this order (see `main.py`): access logging → license guard → admin session guard.

- **License guard**: protects `/api/templates`, `/api/mapping`, `/api/generation`, `/api/fonts`, `/api/workspaces`. Requires `X-License-Key` (+ `X-Device-Id`) headers, or `license_key`/`license`/`key` + `device_id` query params (needed because `<img src>` can't send headers). Validation logic is in `services/licensing.py`.
- **Admin session guard**: protects `/admin/*` and `/`. Falls back to HTTP Basic (`YMGA_LICENSE_ADMIN_USERNAME`/`YMGA_LICENSE_ADMIN_PASSWORD`) then issues a signed session cookie.

### Key concept: workspaces
Every request is scoped to a `workspace_id` (`server/app/services/storage.py`). Uploads, extracted images, fonts, masks, and outputs all live under `server/app/data/<workspace_id>/`. By default the server **wipes all workspaces on startup** (`YMGA_CLEAR_WORKSPACES_ON_STARTUP`, default true) — internal `_`-prefixed folders like `_licenses` are preserved. A background cleanup thread (`services/workspace_cleanup.py`, started in `main.py`'s lifespan) expires idle/ended sessions.

### Pipeline stages (frontend stepper mirrors these 1:1)
1. **Template parsing** (`POST /api/templates/parse`, `services/template_parser.py`) — OpenCV HSV colour detection of guide rectangles: mugshot=green `#00bf63`, baby=blue `#004aad`, name=orange `#ff751f`, quote=red `#ff3131` (custom hex supported). Tolerance sweeps retry with widening HSV ranges if nothing is found. Name + quote boxes are required or parsing fails; min box area 400px². Boxes are grouped into per-student slots by proximity in reading order. Baby slots get a saved mask (`masks/baby/{x}_{y}_{w}_{h}.png`) for non-rectangular cutouts.
2. **Spreadsheet + portrait ingest** (`POST /api/mapping/ingest`, `services/spreadsheet.py`) — spreadsheet needs `first_name`/`last_name` headers; default mugshot matching expects numeric filenames mapped to 1-based row index, with optional fuzzy name-token matching.
3. **Review mapping** (`services/mapping_review.py`) — decisions are `keep|replace|shift|shift_up|skip|remove`; `shift` cascades blanks downward through the list.
4. **Quotes / baby photos (optional)** — matched to people by normalized name tokens, with fuzzy/partial matching fallback.
5. **Styling** — name and quote text have independent font/size/alignment/case settings.
6. **Generation** (`POST /api/generation/generate`, `services/generator.py`) — runs in a background thread; poll `/api/generation/status` for progress (`services/progress.py`, in-memory job state). Placement order (`services/placement.py`) supports `left_then_right` vs `simultaneous` numbering, with optional alphabetical sort and manual per-person slot overrides.
7. **Results** — `output.png`/`output_*.png` (or PDF/TIFF) per spread.

### Frontend
`web/src/App.tsx` is the stepper state machine (steps in `web/src/steps/*.tsx`) and is intentionally the largest file in the repo — it owns session persistence, config import/export, and generation polling, not just rendering. `web/src/api.ts` is the single typed API client for all backend domains. Components in `web/src/components/` are shared across steps (e.g. `BabyPhotoEditor.tsx` for crop/background-removal UX, `FontPick.tsx` for the font picker backed by `services/fonts.py`).

### Fonts
Backend resolves fonts in order: uploaded TTF/OTF in `<workspace>/fonts/` → system fonts (OS-specific dirs) → Pillow default. Upload/list via `/api/fonts/*` (`services/fonts.py`); frontend font-family strings must match the CSS stack name used in `FontPick.tsx` or Pillow silently falls back.

### Known structural debt
See `CODEBASE_ORGANIZATION_REPORT.md` for a fuller breakdown. The short version: `web/src/App.tsx` (~2.8k lines), `web/src/steps/BabyPhotosStep.tsx` (~1.8k), and `server/app/services/generator.py` / `server/app/routes/mapping.py` are oversized multi-concern files. No refactor is in progress — when touching these, prefer surgical edits over drive-by restructuring unless the task is specifically about cleanup.

## Conventions
- API payloads are snake_case end-to-end (Pydantic ↔ TS); don't introduce camelCase fields on the wire.
- Backend tests monkeypatch `storage.BASE_DATA` to a tmp dir rather than touching real workspace data (see `server/tests/test_storage.py`).
- Template-parser tests build synthetic BGR images with OpenCV and feed them through `cv2.imencode` (see `server/tests/test_template_parser.py`) rather than using fixture image files.
