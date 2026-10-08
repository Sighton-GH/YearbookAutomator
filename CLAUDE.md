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
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Tool frontend
```sh
cd tool/web
npm install
npm run dev       # Vite dev server on :5173, proxies /api -> 127.0.0.1:8000
npm run build     # tsc && vite build
npm run lint       # eslint .
npm run e2e        # isolated fictional-data Playwright suite
# Generate repeatable fictional projects from repo root:
# tool/server/.venv/bin/python scripts/make_synthetic_project.py --out /tmp/fictional-project --students 40 --seed 1
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

### Admin panel & performance/resource limits (tool backend)
The admin panel (`/`, `/admin/usage`, `/admin/sessions`, `/admin/audit`, `/admin/licenses`, `/admin/settings`) is 100% server-rendered HTML — no React, no templating engine, just f-strings. Shared layout/CSS/formatting/chart helpers live in `app/routes/admin_ui.py` (`admin_layout`, `admin_nav`, `badge`, `stat_card`, `meter`, `bar_chart`, `line_chart`, `stacked_bar`, `audit_event_badge`, `fmt_*`) — all no-JS (plain divs/inline SVG); every admin route module imports from there rather than duplicating markup/CSS. `app/services/admin_dashboard.py` exposes two composed snapshots: `get_dashboard_snapshot()` (sessions via `workspace_registry.list_all_sessions_detailed()`, license/usage summaries, point-in-time `system_stats`/`gpu_stats`, `bandwidth` snapshot, and the 8 most recent `workspace_registry.recent_audit()` events) for the Dashboard/Sessions pages, and `get_usage_snapshot()` for the Usage page (adds `metrics.history_buckets()` for request volume, `system_stats.resource_history()` for CPU/RAM/GPU trend lines, and `usage_stats.py`'s day-bucketed/license-type-split/top-keys breakdowns of the persisted usage log). `system_stats.resource_history_loop()` is a background thread (started in `main.py`'s lifespan alongside `cleanup_loop`) that samples CPU/RAM/GPU every 15s into an in-memory deque — like `metrics`'s request history, it resets on restart; `usage_stats.py`'s day/license-type/top-keys breakdowns are backed by the persisted `_licenses/usage.json` log instead, so those survive restarts. `workspace_registry.recent_audit()` events (workspace lifecycle — created/resumed/recreated-after-expiry/released/taken-over/pruned) persist to `_licenses/workspace_audit.json`, retention controlled by the "Workspace audit retention" setting; `/admin/audit` is the full log view, the Dashboard shows only the 8 most recent plus a link there.

Admin-configurable performance/resource limits (`/admin/settings` → "Performance & Resource Limits", persisted in `FaceDetectionSettings`, applied by `app/services/throttle.py` + `app/services/bandwidth.py`): network upload/download KB/s caps (ASGI `TrafficMiddleware` in `main.py`, registered *last* so it's the outermost middleware and can throttle raw request/response byte chunks), CPU max threads + speed-limit percent + low-priority toggle (`throttle.apply_cpu_limits()` — sets `cv2.setNumThreads`, `OMP_NUM_THREADS` for rembg, and psutil process niceness; POSIX niceness can't be lowered back without root once raised, so disabling "low priority" may need a restart), and GPU disable/speed-limit/concurrency-limit (wired into `background_removal.py` and `face_detection.py` via `throttle.gpu_pace()` / `throttle.gpu_concurrency_gate()`). `app/services/admin_settings.py`'s `_SETTINGS_DIR`/`_SETTINGS_PATH` are computed once at import time from `storage.BASE_DATA` (not a live reference) — tests that persist settings must monkeypatch those two attributes directly, not just `storage.BASE_DATA`.

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
Every request is scoped to a `workspace_id` (`tool/server/app/services/storage.py`). Uploads, extracted images, fonts, masks, and outputs all live under `tool/server/app/data/<workspace_id>/`. By default the server **wipes all workspaces on startup** (`YMGA_CLEAR_WORKSPACES_ON_STARTUP`, default true) — internal `_`-prefixed folders like `_licenses` are preserved. A background cleanup thread (`services/workspace_cleanup.py`, started in `main.py`'s lifespan) deletes a workspace once its **workspace session** (the checkout tied to a license — lock, TTL, `/admin/sessions` entry) expires or is explicitly ended.

Workspace-session expiry policy differs by license type: personal licenses always use the admin-configured `personal_workspace_timeout_seconds` setting (`/admin/settings`, default 8h); commercial licenses are configured per-license on `/admin/licenses` (`workspace_expiry_seconds` custom duration, or `workspace_expiry_disabled` to never expire — falls back to an 8h default if neither is set). `workspace_registry.py`'s `_resolve_ttl_policy()` resolves this at `/resolve` time and caches it on the registry binding; `workspace_cleanup.py`'s janitor skips both its expiry checks entirely for any workspace with `workspace_expiry_disabled` set in `meta.json` (an explicit end-session request is still honored either way).

### Pipeline stages (condensed into the tool frontend's 5-step flow — see Tool frontend below)
1. **Template parsing** (`POST /api/templates/parse`, `services/template_parser.py`) — OpenCV HSV colour detection of guide rectangles: mugshot=green `#00bf63`, baby=blue `#004aad`, name=orange `#ff751f`, quote=red `#ff3131` (custom hex supported). Tolerance sweeps retry with widening HSV ranges if nothing is found. Name + quote boxes are required or parsing fails; min box area 400px². Boxes are grouped into per-student slots by proximity in reading order. Baby slots get a saved mask (`masks/baby/{x}_{y}_{w}_{h}.png`) for non-rectangular cutouts.
2. **Spreadsheet + portrait ingest** (`POST /api/mapping/ingest`, `services/spreadsheet.py`) — spreadsheet needs headers containing the substrings "first name"/"last name" (case-insensitive, so `First Name`/`first_name`-style headers both fail — `_find_name_columns` does a literal `"first name" in col_lower` check, not a normalized match); default mugshot matching expects numeric filenames mapped to 1-based row index, with optional fuzzy name-token matching.
3. **Review mapping** (`services/mapping_review.py`) — decisions are `keep|replace|shift|shift_up|skip|remove`; `shift` cascades blanks downward through the list.
4. **Quotes / baby photos (optional)** — matched to people by normalized name tokens, with fuzzy/partial matching fallback.
5. **Styling** — name and quote text have independent font/size/alignment/case settings.
6. **Generation** (`POST /api/generation/generate`, `services/generator.py`) — runs in a background thread; poll `/api/generation/status` for progress (`services/progress.py`, in-memory job state). Placement order (`services/placement.py`) supports `left_then_right` vs `simultaneous` numbering, with optional alphabetical sort and manual per-person slot overrides.
7. **Results** — `output.png`/`output_*.png` (or PDF/TIFF) per spread.

### Tool frontend
`tool/web/src/App.tsx` is the state machine for a 5-step flow — **Template → Roster & Photos → People → Style → Generate** (`activeStep: TopStep`, see `tool/web/src/session.ts`) — and is intentionally the largest file in the repo: it owns all top-level state, session persistence, config import/export, and generation polling, not just rendering. It's mounted directly (no client-side router pages) via `tool/web/src/pages/ToolAppPage.tsx`, which owns the license-gate UI (key entry, validation, free-key request — see `activateLicense()`) and the session/theme/help UI around it; until a valid key is set, `App` never mounts. `migrateActiveStep` in `session.ts` maps legacy step values (the 8-step numeric wizard, and the interim 3-phase Import/Edit/Finalize model) onto the current 5-step union, so old saved sessions/configs and `?step=` URLs keep working.

The shell is a 3-pane layout (`components/RoadmapRail.tsx` + `.app-canvas`, styled in `styles/08-workspace.css`): a left vertical rail shows all 5 steps with done/current/locked state, the canvas renders the active step's content, and a persistent right-side **Inspector** (`components/Inspector.tsx`) appears inside steps that need fine adjustment — Figma/Linear-style: broad gestures (drag a box, click a card) happen in the canvas, precise edits happen in the Inspector.

Each step **reuses** the underlying components from the prior Import/Edit/Finalize redesign rather than owning separate ones — when modifying a step's behavior, edit the underlying component, not `App.tsx`'s step-selection logic:
- **Template** and **Roster & Photos** render `steps/ImportStep.tsx`, which takes a `sections` prop (`"template" | "portraits" | "quotes" | "baby"`) so each step shows only its relevant upload card(s); `sections={["template"]}` for Template, `["portraits"]` for Roster & Photos, `["quotes","baby"]` for People (see below). Each card's backend call is independently retryable.
- **People** renders `steps/edit/EditStep.tsx` with `hideTabs` (so its internal Layout/People/Style `TabBar` is suppressed) pinned to `editTab="people"`, **plus** `ImportStep` with `sections={["quotes","baby"]}` for the optional quote/baby uploads — CSS `order` (`.edit-first` on `.app-canvas`) puts the people grid first and the optional upload cards below it. The People grid (`steps/edit/PeopleTab.tsx`, the largest of the step files) is one unified grid of `PeopleCard`s (portrait+baby+quote together) with full per-person editing in the Inspector (`components/PersonInspector.tsx`), including the baby-photo crop/rotate/background-removal/face-center modal — `components/BabyPhotoEditor.tsx` is the **only** baby-photo editor, don't reintroduce a second implementation.
- **Template**'s layout editor also renders `EditStep` with `hideTabs` pinned to `editTab="layout"`, pairing `components/TemplatePreview.tsx` with per-slot coordinate fields (`components/SlotInspectorFields.tsx`).
- **Style** renders `EditStep` with `hideTabs` pinned to `editTab="style"` (the font pickers, `FontPick.tsx`).
- **Generate** renders `steps/FinalizeStep.tsx` — output format/resolution/placement settings plus a live preview render; a results section (downloads, license usage) reveals once spreads exist.

`tool/web/src/api.ts` is the single typed API client for all backend domains. Theming is dark-by-default with a light toggle (`components/ThemeToggle.tsx`), driven by a `data-theme` attribute on `<html>` (not a CSS class) — see `styles/00-variables.css` for the light/dark token sets (spacing/radius/shadow/type/motion scale lives in `styles/00-tokens.css`, theme-independent, imported first) and `index.html`'s inline pre-paint script that avoids a flash of the wrong theme.

### Help & onboarding
First-run guided tour (`components/GuidedTour.tsx`) auto-opens once per browser (`localStorage` key `ymga-tour-seen-v1`) and spotlights key UI via CSS-selector targets; replayable from the topbar **Help** button, which opens `components/HelpPanel.tsx` (a slide-over with "Replay tour", "Load a sample project", and a docs link). "Load a sample project" dispatches a `window` event (`ymga:load-sample`, handled in `App.tsx`) that fetches the small bundled sample under `tool/web/public/assets/sample/` (fictional roster + a handful of real-format portraits, not the full test dataset) through the normal upload/parse/ingest pipeline, then signals completion via `ymga:load-sample-done`. `InfoPopover` (`?` buttons) remain the per-field contextual help mechanism.

### Branding
User-facing product name is **"Custom Flow Automator"**; company/site brand is **"Sighton Yearbook Tools"** (see `website/src/components/SiteTopBar.tsx`/`SiteFooter.tsx` for the canonical strings and title pattern `"{Page} — Sighton Yearbook Tools"`). `tool/web`'s `index.html` title, `App.tsx`'s standalone header, and `ToolAppPage.tsx`'s topbar/footer must all match this — they drifted out of sync once already (to "Yearbook Auto Flow" / "Sighton Innovations"), so don't reintroduce ad-hoc product/company names.

### Fonts
Backend resolves fonts in order: uploaded TTF/OTF in `<workspace>/fonts/` → system fonts (OS-specific dirs) → Pillow default. Upload/list via `/api/fonts/*` (`services/fonts.py`); frontend font-family strings must match the CSS stack name used in `FontPick.tsx` or Pillow silently falls back.

### Website
Astro project (`website/src/pages/*.astro`) with React islands for anything interactive (`website/src/components/*.tsx`, hydrated via `client:load`); fully static pages (About, Pricing, Privacy, License) ship no client JS. `website/src/layouts/SiteLayout.astro` wraps every page with `SiteTopBar`/`SiteFooter`. There is no `/tool` page and no license code here at all — `SiteTopBar`'s "Tool" link and the "Open the Tool"/"Get Started Free" CTAs in `AboutPage.tsx`/`PricingPage.tsx` are plain links to `TOOL_URL`. Styling and a couple of files are duplicated from `tool/web` (`baseUrl.ts`, the `styles/*.css` files) rather than shared, since the two projects build and deploy independently — when editing shared-looking files, check whether the counterpart in the other project also needs the change.

### Known structural debt
See `CODEBASE_ORGANIZATION_REPORT.md` for a fuller breakdown (paths there predate the `tool/`/`website/` split and both later frontend redesigns — Import/Edit/Finalize, then the current 5-step roadmap — mentally prefix `server/`/`web/` with `tool/` and ignore step filenames). The short version: `tool/web/src/App.tsx` (~2.9k lines), `tool/web/src/steps/ImportStep.tsx` (~1.6k), `tool/web/src/steps/edit/PeopleTab.tsx`, and `tool/server/app/services/generator.py` / `tool/server/app/routes/mapping.py` are oversized multi-concern files. No refactor is in progress — when touching these, prefer surgical edits over drive-by restructuring unless the task is specifically about cleanup.

## Production deployment (live on this machine)
- The tool is exposed publicly at `https://yearbooktool.sighton.ca` via a Cloudflare Tunnel (`cloudflared` systemd service, remotely-managed ingress — origin service must be `http://localhost:5173`, not `https://`, since the frontend serves plain HTTP).
- Backend and frontend run as systemd services, unit files tracked at `deploy/systemd/ymga-backend.service` and `deploy/systemd/ymga-frontend.service` (installed to `/etc/systemd/system/`):
  - `ymga-backend.service` — runs `uvicorn app.main:app` (no `--reload`) on `127.0.0.1:8000`.
  - `ymga-frontend.service` — runs `npm run preview` (serves the last `tool/web` production build, i.e. whatever's in `tool/web/dist/`) on `127.0.0.1:5173`.
- Both frontend and backend bind to loopback. Remote access must use the official HTTPS hostname through the Cloudflare Tunnel; do not expose either plain-HTTP port over LAN or Tailscale.
- **Neither service auto-updates on code changes.** The backend needs `sudo systemctl restart ymga-backend.service` to pick up Python changes; the frontend needs `cd tool/web && npm run build` followed by `sudo systemctl restart ymga-frontend.service` to pick up frontend changes.
- The marketing website (`yearbook.sighton.ca`) auto-builds/deploys to Cloudflare Workers on new commits (dashboard-side Git integration) — no local action needed for it.
- **After making any change to `tool/server` or `tool/web` that would affect the running app, ask the user whether they want the corresponding systemd service rebuilt/restarted** — don't restart it automatically without asking.

## Conventions
- API payloads are snake_case end-to-end (Pydantic ↔ TS); don't introduce camelCase fields on the wire.
- Backend tests monkeypatch `storage.BASE_DATA` to a tmp dir rather than touching real workspace data (see `tool/server/tests/test_storage.py`).
- Template-parser tests build synthetic BGR images with OpenCV and feed them through `cv2.imencode` (see `tool/server/tests/test_template_parser.py`) rather than using fixture image files.
- `website` pages/components that exist only as static marketing/legal copy (`AboutPage.tsx`, `PricingPage.tsx`, `PrivacyPage.tsx`, `LicensePage.tsx`) should stay free of client-side state — add a `client:load` directive on the Astro page only if you introduce real interactivity.
