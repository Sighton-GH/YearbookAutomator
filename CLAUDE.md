# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The repo has two independent halves:

- **`tool/`** — the actual product: FastAPI backend (`tool/server/`) + React/Vite frontend (`tool/web/`). Users upload an annotated template (coloured guide boxes), a clean template (background art), a roster spreadsheet, and ZIPs of portrait/baby photos; the backend detects layout slots by colour, matches people to images, and renders finished spread PNGs/PDFs/TIFFs. This is a local-first app (student data stays on the user's machine in normal use).
- **`website/`** — the marketing/info site (About, Documentation, Pricing, License, Privacy pages). It's an Astro project with no backend of its own, deployed as static assets on Cloudflare Workers (`wrangler.jsonc`, no SSR adapter) separately from `tool/`. It has no license logic at all — every "Tool" link/CTA is a plain external link to wherever `tool/web` is deployed.

These deploy independently and talk to each other only over absolute URLs (see "Cross-project wiring" below) — they share no build step or runtime.

## Commands

### Tool backend (Python 3.12 — avoid 3.13+)
```sh
cd tool/server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Tool frontend
```sh
cd tool/web
npm install
npm run dev       # Vite dev server on :5173, proxies /api -> 127.0.0.1:8000
npm run build     # tsc && vite build
npm run lint       # eslint .
```

### Tool backend + frontend together
```sh
bash start-dev.sh
```

### Website (Astro, static, deploys to Cloudflare Workers)
```sh
cd website
npm install
npm run dev       # Astro dev server, default :4321
npm run build     # astro build -> website/dist
npm run cf:dev    # build, then serve through the real Workers runtime locally (:8788)
npm run deploy    # build, then `wrangler deploy` (needs `npx wrangler login` once)
```
`PUBLIC_*` env vars (e.g. `PUBLIC_TOOL_URL`) are inlined at build time by Astro — there's no server reading them at request time, so they must be set in `.env` (or the build environment) before `npm run build`/`npm run deploy`, not via the Cloudflare dashboard or `wrangler secret`.

### Tests (tool backend only)
```sh
cd tool/server
.venv/bin/python -m pytest                      # all tests
.venv/bin/python -m pytest tests/test_template_parser.py   # one file
.venv/bin/python -m pytest tests/test_template_parser.py::test_name -v  # one test
```
There is no frontend test suite for either project — verify `tool/web` changes by running its dev server and exercising the stepper UI; verify `website` changes by running its dev server and checking the affected page.

### GPU / acceleration env vars (tool backend)
- `YMGA_REMBG_PROVIDER` — force a provider for background removal (e.g. `CUDAExecutionProvider`, `DmlExecutionProvider`).
- `YMGA_FACE_PROVIDER`, `YMGA_YUNET_BACKEND`, `YMGA_YUNET_TARGET` — face-detection backend selection.
- `YMGA_RENDER_PREFER_GPU`, `YMGA_OPENCL` — rendering pipeline GPU toggles.
- Verify ONNX providers with: `python -c "import onnxruntime; print(onnxruntime.get_available_providers())"`.

Most other runtime knobs (admin auth, license limits, workspace cleanup/session timers) are `YMGA_*` env vars read in `tool/server/app/services/*` — grep `os.getenv` in `tool/server/app` before assuming a behavior is hardcoded.

## Cross-project wiring

`tool/web`, `tool/server`, and `website` are deployed separately. The website carries no licensing logic and makes no API calls at all — license entry, validation, and free-key requests all happen inside `tool/web` itself (`ToolAppPage.tsx`, via `tool/web/src/licensing.ts` calling the same-origin/proxied `/api/licensing/*`). The only cross-project reference is one absolute URL each way:

- `website/.env` (`PUBLIC_TOOL_URL`) — `website/src/lib/env.ts`'s `TOOL_URL` is what every "Tool" nav link and "Open the Tool" CTA points at (`SiteTopBar.tsx`, `AboutPage.tsx`, `PricingPage.tsx`). Plain link, no query params, no API call.
- `tool/web/.env` (`VITE_WEBSITE_URL`) — `tool/web/src/env.ts`'s `WEBSITE_URL` is used by `ToolAppPage.tsx` for the "Back to main website" link.
- Both `.env.example` files document the local-dev defaults (tool backend on `:8000`, tool frontend on `:5173`, website on `:4321`); copy to `.env` and adjust for actual deployments.

## Architecture

### Tool backend: routes delegate to services
`tool/server/app/main.py` wires FastAPI routers from `tool/server/app/routes/*.py` under `/api/<domain>`; each route module should stay thin (HTTP parsing/validation) and call into `tool/server/app/services/*.py` for actual logic. Shared Pydantic contracts live in `tool/server/app/models/schemas.py` (snake_case fields — keep `tool/web/src/types.ts` in sync manually, there is no codegen).

Three middleware layers run on every request, in this order (see `main.py`): access logging → license guard → admin session guard.

- **License guard**: protects `/api/templates`, `/api/mapping`, `/api/generation`, `/api/fonts`, `/api/workspaces`. Requires `X-License-Key` (+ `X-Device-Id`) headers, or `license_key`/`license`/`key` + `device_id` query params (needed because `<img src>` can't send headers). Validation logic is in `services/licensing.py`.
- **Admin session guard**: protects `/admin/*` and `/`. Falls back to HTTP Basic (`YMGA_LICENSE_ADMIN_USERNAME`/`YMGA_LICENSE_ADMIN_PASSWORD`) then issues a signed session cookie.

### Key concept: workspaces
Every request is scoped to a `workspace_id` (`tool/server/app/services/storage.py`). Uploads, extracted images, fonts, masks, and outputs all live under `tool/server/app/data/<workspace_id>/`. By default the server **wipes all workspaces on startup** (`YMGA_CLEAR_WORKSPACES_ON_STARTUP`, default true) — internal `_`-prefixed folders like `_licenses` are preserved. A background cleanup thread (`services/workspace_cleanup.py`, started in `main.py`'s lifespan) expires idle/ended sessions.

### Pipeline stages (tool frontend stepper mirrors these 1:1)
1. **Template parsing** (`POST /api/templates/parse`, `services/template_parser.py`) — OpenCV HSV colour detection of guide rectangles: mugshot=green `#00bf63`, baby=blue `#004aad`, name=orange `#ff751f`, quote=red `#ff3131` (custom hex supported). Tolerance sweeps retry with widening HSV ranges if nothing is found. Name + quote boxes are required or parsing fails; min box area 400px². Boxes are grouped into per-student slots by proximity in reading order. Baby slots get a saved mask (`masks/baby/{x}_{y}_{w}_{h}.png`) for non-rectangular cutouts.
2. **Spreadsheet + portrait ingest** (`POST /api/mapping/ingest`, `services/spreadsheet.py`) — spreadsheet needs `first_name`/`last_name` headers; default mugshot matching expects numeric filenames mapped to 1-based row index, with optional fuzzy name-token matching.
3. **Review mapping** (`services/mapping_review.py`) — decisions are `keep|replace|shift|shift_up|skip|remove`; `shift` cascades blanks downward through the list.
4. **Quotes / baby photos (optional)** — matched to people by normalized name tokens, with fuzzy/partial matching fallback.
5. **Styling** — name and quote text have independent font/size/alignment/case settings.
6. **Generation** (`POST /api/generation/generate`, `services/generator.py`) — runs in a background thread; poll `/api/generation/status` for progress (`services/progress.py`, in-memory job state). Placement order (`services/placement.py`) supports `left_then_right` vs `simultaneous` numbering, with optional alphabetical sort and manual per-person slot overrides.
7. **Results** — `output.png`/`output_*.png` (or PDF/TIFF) per spread.

### Tool frontend
`tool/web/src/App.tsx` is the stepper state machine (steps in `tool/web/src/steps/*.tsx`) and is intentionally the largest file in the repo — it owns session persistence, config import/export, and generation polling, not just rendering. It's mounted directly (no client-side router pages) via `tool/web/src/pages/ToolAppPage.tsx`, which owns the license-gate UI (key entry, validation, free-key request — see `activateLicense()`) and session UI around it; until a valid key is set, `App` never mounts. `tool/web/src/api.ts` is the single typed API client for all backend domains. Components in `tool/web/src/components/` are shared across steps (e.g. `BabyPhotoEditor.tsx` for crop/background-removal UX, `FontPick.tsx` for the font picker backed by `services/fonts.py`).

### Fonts
Backend resolves fonts in order: uploaded TTF/OTF in `<workspace>/fonts/` → system fonts (OS-specific dirs) → Pillow default. Upload/list via `/api/fonts/*` (`services/fonts.py`); frontend font-family strings must match the CSS stack name used in `FontPick.tsx` or Pillow silently falls back.

### Website
Astro project (`website/src/pages/*.astro`) with React islands for anything interactive (`website/src/components/*.tsx`, hydrated via `client:load`); fully static pages (About, Pricing, Privacy, License) ship no client JS. `website/src/layouts/SiteLayout.astro` wraps every page with `SiteTopBar`/`SiteFooter`. There is no `/tool` page and no license code here at all — `SiteTopBar`'s "Tool" link and the "Open the Tool"/"Get Started Free" CTAs in `AboutPage.tsx`/`PricingPage.tsx` are plain links to `TOOL_URL`. Styling and a couple of files are duplicated from `tool/web` (`baseUrl.ts`, the `styles/*.css` files) rather than shared, since the two projects build and deploy independently — when editing shared-looking files, check whether the counterpart in the other project also needs the change.

### Known structural debt
See `CODEBASE_ORGANIZATION_REPORT.md` for a fuller breakdown (paths there predate the `tool/`/`website/` split — mentally prefix `server/`/`web/` with `tool/`). The short version: `tool/web/src/App.tsx` (~2.8k lines), `tool/web/src/steps/BabyPhotosStep.tsx` (~1.8k), and `tool/server/app/services/generator.py` / `tool/server/app/routes/mapping.py` are oversized multi-concern files. No refactor is in progress — when touching these, prefer surgical edits over drive-by restructuring unless the task is specifically about cleanup.

## Conventions
- API payloads are snake_case end-to-end (Pydantic ↔ TS); don't introduce camelCase fields on the wire.
- Backend tests monkeypatch `storage.BASE_DATA` to a tmp dir rather than touching real workspace data (see `tool/server/tests/test_storage.py`).
- Template-parser tests build synthetic BGR images with OpenCV and feed them through `cv2.imencode` (see `tool/server/tests/test_template_parser.py`) rather than using fixture image files.
- `website` pages/components that exist only as static marketing/legal copy (`AboutPage.tsx`, `PricingPage.tsx`, `PrivacyPage.tsx`, `LicensePage.tsx`) should stay free of client-side state — add a `client:load` directive on the Astro page only if you introduce real interactivity.
