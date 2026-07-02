# Yearbook Grad Mugshot Automator – Copilot instructions

## Big picture
- The repo splits into `tool/` (the product: FastAPI backend + React/Vite frontend) and `website/` (Astro marketing/info site, deploys as static assets on Cloudflare Workers via `wrangler.jsonc` — no SSR adapter). They build and deploy independently and only talk via absolute URLs — see "Cross-project wiring" below.
- FastAPI backend entry in [tool/server/app/main.py](../tool/server/app/main.py) with routers in [tool/server/app/routes](../tool/server/app/routes) delegating to services in [tool/server/app/services](../tool/server/app/services).
- React/Vite tool frontend is the stepper UI in [tool/web/src/App.tsx](../tool/web/src/App.tsx), mounted via [tool/web/src/pages/ToolAppPage.tsx](../tool/web/src/pages/ToolAppPage.tsx), calling the typed API client in [tool/web/src/api.ts](../tool/web/src/api.ts).
- Astro website pages live in [website/src/pages](../website/src/pages) (`.astro` files), rendering React islands from [website/src/components](../website/src/components) (e.g. `AboutPage.tsx`, `SiteTopBar.tsx`) wrapped by [website/src/layouts/SiteLayout.astro](../website/src/layouts/SiteLayout.astro). There is no `/tool` page on the website — it has no licensing code at all.
- API contracts are Pydantic models in [tool/server/app/models/schemas.py](../tool/server/app/models/schemas.py); keep TS types in sync (snake_case fields).

## Cross-project wiring
- The website makes no API calls and has no license logic. Every "Tool" link/CTA (`SiteTopBar.tsx`, `AboutPage.tsx`, `PricingPage.tsx`) is a plain external link to `PUBLIC_TOOL_URL` ([website/src/lib/env.ts](../website/src/lib/env.ts)).
- License key entry, validation, and free-key requests all happen inside `tool/web` — see `activateLicense()` in [tool/web/src/pages/ToolAppPage.tsx](../tool/web/src/pages/ToolAppPage.tsx), backed by [tool/web/src/licensing.ts](../tool/web/src/licensing.ts) calling the (same-origin/proxied) backend. The "back to main site" link there uses `VITE_WEBSITE_URL` ([tool/web/src/env.ts](../tool/web/src/env.ts)).
- Each project has a `.env.example` documenting local-dev defaults; copy to `.env` and adjust for real deployments.

## Critical workflows (Windows)
- Backend uses Python 3.12 (avoid 3.13+). Start: `cd tool\server; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
- Tool frontend dev server: `cd tool\web; npm install; npm run dev` (Vite proxies `/api` → backend; see [tool/web/vite.config.ts](../tool/web/vite.config.ts)).
- Website dev server: `cd website; npm install; npm run dev` (Astro, fully static — no proxy, no backend calls).
- Tests: `cd tool\server; pytest` (see [tool/server/tests](../tool/server/tests)). No test suite for either frontend.

## Project-specific conventions
- **Licensing**: Protected routes require `X-License-Key` + `X-Device-Id` headers in [tool/server/app/main.py](../tool/server/app/main.py). Asset/image URLs must pass `license_key|license|key` + `device_id` via helpers in [tool/web/src/api.ts](../tool/web/src/api.ts). UI error messaging uses `describeApiError()` in [tool/web/src/configFile.ts](../tool/web/src/configFile.ts). Admin panel (server-rendered HTML, no React) has 6 pages — Dashboard (`/`), Usage (`/admin/usage`), Sessions (`/admin/sessions`), Audit Log (`/admin/audit`), Licenses (`/admin/licenses`), Settings (`/admin/settings`) — sharing layout/CSS helpers from [tool/server/app/routes/admin_ui.py](../tool/server/app/routes/admin_ui.py) (see [README.md](../README.md)). All of the key-entry/validation UI lives in `tool/web` (`ToolAppPage.tsx`) — the website has none of it.
- **Workspace storage**: Each workspace is `tool/server/app/data/<workspace_id>/` with template assets, uploads, outputs, and meta. Validation in [tool/server/app/services/storage.py](../tool/server/app/services/storage.py). Cleanup janitor runs in [tool/server/app/services/workspace_cleanup.py](../tool/server/app/services/workspace_cleanup.py), started by [tool/server/app/main.py](../tool/server/app/main.py). A workspace is deleted when its **workspace session** expires: personal licenses use the admin-configured `personal_workspace_timeout_seconds` (default 8h); commercial licenses set a per-license `workspace_expiry_seconds`/`workspace_expiry_disabled` override on `/admin/licenses` (resolved in [tool/server/app/services/workspace_registry.py](../tool/server/app/services/workspace_registry.py)'s `_resolve_ttl_policy()`), and the janitor skips disabled-expiry workspaces entirely.
- **Template parsing**: `POST /api/templates/parse` → `extract_slots()` in [tool/server/app/services/template_parser.py](../tool/server/app/services/template_parser.py). HSV tolerance sweeps (defaults 20→24→32→40→48; custom 24→32→40→48→64), min box area floor 400 px², name+quote boxes required. Baby masks saved as `masks/baby/{x}_{y}_{w}_{h}.png` (coordinate keyed).
- **Mapping**: `/api/mapping/ingest` expects `first_name`/`last_name` headers and numeric filenames mapping to **1-based** rows. Review actions include `keep|replace|shift|shift_up|skip|remove` in [tool/server/app/services/mapping_review.py](../tool/server/app/services/mapping_review.py).
- **Generation**: `/api/generation/generate` runs background threads; progress is in-memory via [tool/server/app/services/progress.py](../tool/server/app/services/progress.py). Placement order is computed in [tool/server/app/services/placement.py](../tool/server/app/services/placement.py) (`left_then_right` vs `simultaneous`).
- **Fonts**: Backend resolves uploaded fonts first (<workspace>/fonts/), then system fonts, then Pillow default in [tool/server/app/services/fonts.py](../tool/server/app/services/fonts.py). Frontend uses CSS font stacks in [tool/web/src/components/FontPick.tsx](../tool/web/src/components/FontPick.tsx).
- **Website pages**: `AboutPage.tsx`, `PricingPage.tsx`, `PrivacyPage.tsx`, `LicensePage.tsx` are static (no hooks) — their `.astro` pages render them with no `client:*` directive. `DocumentationPage.tsx` is stateful and needs `client:load` on its `.astro` page.

## Tests & fixtures
- Template parsing tests use OpenCV BGR rectangles and `cv2.imencode` in [tool/server/tests/test_template_parser.py](../tool/server/tests/test_template_parser.py).
- Storage tests override workspace root with `monkeypatch.setattr(storage_mod, "BASE_DATA", tmp_path / "data")` in [tool/server/tests/test_storage.py](../tool/server/tests/test_storage.py).

## Common gotchas
- Default startup wipes workspaces (`YMGA_CLEAR_WORKSPACES_ON_STARTUP=true`) in [tool/server/app/main.py](../tool/server/app/main.py).
- Missing `first_name`/`last_name` or non-numeric portrait filenames trigger ingest warnings.
- Custom fonts must be uploaded and the CSS stack name must match; otherwise Pillow falls back.
- `tool/web` and `website` duplicate a few files on purpose (styles, `baseUrl.ts`) since they're separate deployable projects — check both when changing shared-looking UI.
