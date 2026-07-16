# Backend reference (`tool/server`)

FastAPI app, Python 3.12. Entry point `tool/server/app/main.py`. See [`01-architecture.md`](01-architecture.md) for the request-flow/middleware overview and the workspace/session model — this page covers the rest of the backend: module map, the data model, licensing internals, the admin panel, and performance controls. For the actual image-processing/matching algorithms, see [`02-pipeline.md`](02-pipeline.md). For a flat list of every HTTP endpoint, see [`04-api-reference.md`](04-api-reference.md).

## Module map

`app/main.py` wires routers from `app/routes/*.py` (thin HTTP parsing/validation) which delegate to `app/services/*.py` (actual logic). Shared Pydantic contracts live in `app/models/schemas.py`.

### Routes (`app/routes/`)

| File | Prefix | Guard | Covers |
|---|---|---|---|
| `templates.py` | `/api/templates` | license | Template upload + colour-detection parsing |
| `mapping.py` | `/api/mapping` | license | Spreadsheet ingest, portrait/baby/quote matching, per-image uploads, background removal jobs, asset serving |
| `workspaces.py` | `/api/workspaces` | license (+ admin for `/takeover`) | Workspace resolve/touch/release/state/end-session/delete |
| `generation.py` | `/api/generation` | license | Kick off rendering, poll status, list/download outputs |
| `fonts.py` | `/api/fonts` | license | List system/uploaded fonts, upload custom fonts |
| `licensing.py` | `/api/licensing/*` (public) + `/admin/*` | mixed | License validation/free-key API, admin login, and the license-management admin pages |
| `admin_dashboard.py` | `/admin/sessions`, `/admin/audit` | admin | Workspace-session table + audit log pages |
| `admin_settings.py` | `/admin/settings` (+ `/api/admin/settings/features`, public) | mixed | All admin-configurable settings, and the feature-flags endpoint the frontend reads |
| `admin_usage.py` | `/admin/usage` | admin | Usage/metrics deep-dive page |
| `admin_ui.py` | — (no router) | — | Shared no-JS HTML/CSS presentation layer used by every admin page (see [The admin panel](#the-admin-panel)) |

### Services (`app/services/`)

| File | Covers |
|---|---|
| `template_parser.py` | HSV colour detection → slot extraction (see [`02-pipeline.md`](02-pipeline.md#1-template-parsing)) |
| `spreadsheet.py` | Roster parsing, header matching, portrait filename/name matching (see [`02-pipeline.md`](02-pipeline.md#2-spreadsheet--portrait-ingest)) |
| `mapping_review.py` | keep/replace/shift/shift_up/skip/remove decision model |
| `generator.py` | The rendering/compositing pipeline (see [`02-pipeline.md`](02-pipeline.md#7-generation)) |
| `placement.py` | Auto-placement / slot numbering order |
| `progress.py` | In-memory generation-job status, polled by the frontend |
| `background_jobs.py` | In-memory job tracker for the background-removal preview/apply flows (separate from `progress.py`) |
| `background_removal.py` | simple/complex/ultra_complex background removal |
| `face_detection.py` | YuNet/RetinaFace/Haar face detection (editor + generation-time) |
| `tiff_layers.py` | Multi-page "layered" TIFF export — **built but not wired into any route** (dead code, see [`09-conventions-and-known-issues.md`](09-conventions-and-known-issues.md)) |
| `fonts.py` | System/workspace font enumeration for the font picker |
| `storage.py` | Workspace directory layout, `meta.json` read/write, session TTL primitives |
| `workspace_registry.py` | Workspace-session binding/checkout-lock/expiry-policy logic, audit log |
| `workspace_cleanup.py` | Background janitor thread that deletes expired/ended workspaces |
| `licensing.py` | License CRUD, validation, personal/commercial policy |
| `licensing_usage.py` | Persisted usage-event log (survives restarts) |
| `admin_dashboard.py` | Composed snapshots backing the Dashboard/Sessions/Usage admin pages |
| `admin_settings.py` | The single settings store (`FaceDetectionSettings`) backing every admin-configurable knob |
| `usage_stats.py` | Day-bucketed usage breakdowns for the Usage page, sourced from the persisted usage log |
| `system_stats.py` | Point-in-time + historical CPU/RAM/GPU sampling |
| `metrics.py` | In-memory request-volume/latency/status-code tracking |
| `throttle.py` | CPU/GPU compute throttling (thread caps, pacing, concurrency gates, process priority) |
| `bandwidth.py` | Network upload/download token-bucket throttling |

## Middleware & request guards

Covered in detail in [`01-architecture.md`](01-architecture.md#backend-request-flow-middleware-stack). Two things worth expanding on here:

### License guard reason codes

`services/licensing.py`'s `validate_license(key, ip, device_id)` returns `(False, {"reason": ...})` on failure, and `main.py`'s `_license_hint()` maps each reason to a user-facing hint string surfaced in the 401 response body:

`missing`, `format` / `not_found` (key doesn't parse as `YMGA1-...` or isn't in the store), `revoked`, `expired`, `device_required` / `device_mismatch` (personal license bound to a different device), `ip_required` / `ip_mismatch` (personal license bound to a different IP), `monthly_limit` (personal license's monthly use cap hit), `max_uses` (commercial license's lifetime use cap hit).

This function only **validates** — it never increments usage counters. Usage is only counted by `validate_and_record_use`, called exclusively from `POST /api/generation/generate` when the request has `count_usage=true` — i.e. merely browsing the tool or uploading files never burns a license use; only an actual "Generate" action does. Separately, `record_license_seen()` updates `last_used_at`/`last_seen_ip`/`last_seen_device_id` on *every* validated request (throttled to at most once per 30s per key to avoid hammering the JSON store), which is why the admin panel's "last seen" timestamp reflects ordinary browsing while "uses" only reflects counted generations.

### Admin session mechanics

`routes/licensing.py` defines the session helpers shared by the whole admin panel:

- `_encode_admin_session` / `_decode_admin_session` — an HMAC-SHA256-signed, base64url-encoded JSON payload `{v:1, iat, lat}` (issued-at, last-active) stored in the `ymga_admin_session` cookie.
- `get_admin_session_state(request)` → `(is_valid, reason, refreshed_token)`, where `reason` is one of `missing`, `invalid`, `max_age` (absolute session lifetime exceeded), `idle` (idle timeout exceeded).
- Falls back to HTTP Basic auth (`YMGA_LICENSE_ADMIN_USERNAME` / `YMGA_LICENSE_ADMIN_PASSWORD`, default username `sighton_admin`) which, on success, mints a fresh session cookie so the browser doesn't re-prompt on every request.
- Idle/max-session timeouts (`YMGA_ADMIN_IDLE_TIMEOUT_SECONDS` default 900s, `YMGA_ADMIN_MAX_SESSION_SECONDS` default 28800s) are admin-settings-overridable, read via `_admin_timeouts()`.

## Data model / Pydantic schemas

`app/models/schemas.py` — the wire contracts. Every field is snake_case and mirrored by hand in `tool/web/src/api.ts`/`types.ts` (no codegen — keep both sides in sync manually when you change this file).

- **`Box`** — `{x, y, width, height}` (int pixels). The universal rectangle type.
- **`TemplateSlots`** — `{mugshot, baby_photo, name, quote}`, each a `Box`. One student's full slot geometry.
- **`RawParseDebug`** — `{mugshot_count, baby_count, name_count, quote_count, mugshots, baby_photos, names, quotes}` (raw pre-grouping box lists) — for troubleshooting a bad parse.
- **`TemplateParseResponse`** — `{template_id, width, height, slots: [TemplateSlots], raw_debug}` — response of `POST /api/templates/parse`.
- **`PersonRecord`** — `{index, first_name, last_name, mugshot_filename?, quote?, baby_photo_filename?}` — the core per-student record threaded through every stage from ingest to generation. `index` is the 1-based spreadsheet row position and is stable across mapping-review operations.
- **`SpreadsheetPreview`** — `{workspace_id, people: [PersonRecord], warnings: [str]}` — the common response shape for ingest/matching endpoints.
- **`MappingDecision`** — `{person_index, action: keep|replace|shift|shift_up|skip|remove, replacement_mugshot?}`.
- **`MappingRequest`** — `{workspace_id, people, decisions}` — body of `POST /api/mapping/review`.
- **`GenerationRequest`** — the largest model, body of `POST /api/generation/generate`:
  - Core: `workspace_id, template_id, slots: [TemplateSlots], people: [PersonRecord]`.
  - Output: `output_format` (`png`/`pdf`/`tiff`, default `png`), `count_usage` (bool), `output_filename?`, `output_width?`/`output_height?` (aspect-locked, downscale-only).
  - Legacy shared styling (still supported for back-compat): `default_quote?`, `default_baby_photo_filename?`, `default_mugshot_filename?`, `font_family` (required), `font_weight="normal"`, `all_caps=False`, `align="left"`.
  - Preferred per-field styling (overrides the legacy fields when set): `name_font_family?/name_font_weight?/name_font_size=40/name_all_caps?/name_align?` and the equivalent `quote_*` set.
  - Baby photo: `baby_background_color?` (hex, filled behind transparent pixels), `center_baby_on_face=False`.
  - Placement: `auto_place=False`, `placement_mode` (`left_then_right`/`simultaneous`), `force_alphabetical=False`, `slot_assignments: {person_index: slot_number}`.

## Licensing system

**Storage:** `data/_licenses/licenses.json` (JSON, atomic write). Keys are HMAC-derived using a secret at `data/_licenses/secret.txt` (auto-generated on first use, or pinned via `YMGA_LICENSE_SECRET` — set this in any deployment that needs keys to survive a data-directory wipe/migration).

**Key format:** `YMGA1-XXXXX-XXXXX-...` — a `YMGA1-` prefix followed by base32-encoded random bytes in 5-character groups. Always stored/compared upper-cased.

### Personal vs. commercial

|  | Personal | Commercial |
|---|---|---|
| Binding | Bound to `(ip, device_id)` at creation | Not bound by default |
| Isolation | One workspace per device (`pers:{key}:{device}`) | One workspace per key, optionally per device too (`comm:{key}` or `comm:{key}:{device}`, admin-configurable) |
| Rate limit | `monthly_limit`, default 5 uses/month (`YMGA_PERSONAL_MONTHLY_LIMIT`) | Optional lifetime `max_uses` cap |
| Workspace checkout | No locking needed (already per-device) | Single-checkout **lock** — only one device can hold the workspace at a time |
| Workspace expiry | Always the global admin setting `personal_workspace_timeout_seconds` | Per-license: custom `workspace_expiry_seconds`, or `workspace_expiry_disabled`, else an 8h default |
| Free-key issuance | `POST /api/licensing/free-key` — idempotent per `(ip, device_id)`, so repeated requests from the same browser/device return the *same* key rather than minting new ones (this is what prevents trivially bypassing the monthly limit) | Created only by an admin, via `/admin/licenses` |

Loopback IP variants (`127.0.0.1` / `::1`) are treated as equivalent for personal-license IP binding, so local dev doesn't get spuriously IP-mismatched.

Admin CRUD (`services/licensing.py`): `create_license`, `delete_license` (irreversible), `update_license` (uses an internal `_UNSET` sentinel so omitted kwargs are left untouched, distinct from explicitly passing `None` to clear a field), `revoke_license` (soft — sets a flag, keeps history), `set_license_unlock_all_steps`, `set_license_workspace_expiry`.

### Usage tracking

Two separate logs, intentionally:
- **`licensing.py`**'s counters (`uses`, `monthly_uses[YYYY-MM]`) live *on the license record itself* and drive validation (is this license over its limit?).
- **`licensing_usage.py`**'s flat event log (`data/_licenses/usage.json`, capped at the 2000 most recent events, each `{ts, key, license_type, ip, device_id, route}`) is a separate audit trail written only when a use is counted, and is what `services/usage_stats.py` aggregates into the admin Usage page's day-bucketed charts. **This log survives backend restarts**; `metrics.py`/`system_stats.py`'s in-memory histories do not.

## The admin panel

Everything under `/` and `/admin/*` is **server-rendered HTML — no React, no templating engine, just Python f-strings.** `app/routes/admin_ui.py` is not a route module at all; it's the shared presentation layer every admin route imports from: `admin_layout`, `admin_nav`, `badge`, `stat_card`, `meter`, `bar_chart` (plain-div bars), `line_chart` (inline SVG polyline), `stacked_bar`, `audit_event_badge`, and `fmt_bytes`/`fmt_duration`/`fmt_ts`/`fmt_relative` formatters. If you're adding a new admin page or card, use these helpers rather than hand-rolling new markup/CSS.

| Page | Route | Backed by |
|---|---|---|
| Dashboard | `GET /` | `admin_dashboard.get_dashboard_snapshot()` — stat cards, system/GPU resource meters, recent license activity, 8 most recent audit events |
| Usage | `GET /admin/usage` | `admin_dashboard.get_usage_snapshot()` — live CPU/RAM/GPU trend lines, request traffic + status-code breakdown, generations-per-day, usage-by-license-type, top license keys |
| Sessions | `GET /admin/sessions` | `workspace_registry.list_all_sessions_detailed()` — every workspace session (registered or orphaned-on-disk), with force-release/end-and-delete actions |
| Audit Log | `GET /admin/audit` | `workspace_registry.recent_audit()` — full workspace-lifecycle event history |
| Licenses | `GET /admin/licenses` | `licensing.list_licenses()` — filterable/paginated table, create/edit/revoke/delete/unlock-all/workspace-expiry actions, recent-usage table |
| Settings | `GET /admin/settings` | `admin_settings.get_face_detection_settings()` — every configurable knob in the app, see below |

`get_dashboard_snapshot()` and `get_usage_snapshot()` are two different compositions over largely the same underlying data sources (sessions, licenses, system stats, metrics, bandwidth) — Dashboard is the "at a glance" view, Usage is the "deep dive" view. Both are plain functions in `services/admin_dashboard.py`, callable/testable independent of the HTML rendering.

### Settings (`/admin/settings`)

Everything here is persisted in one settings store: `app/services/admin_settings.py`'s `FaceDetectionSettings` (a somewhat misleadingly-named frozen dataclass — it now covers far more than face detection), backed by `data/_settings/settings.json`. `get_face_detection_settings()` re-reads the JSON overlay on top of env-var-seeded defaults **on every call, with no caching** — so changes made in the admin UI apply immediately across the whole app without a restart (with the specific exceptions noted under [Performance & resource limits](#performance--resource-limits) below).

Five cards on the page:
1. **Admin Login Credentials** — username (password is env-only, not editable here).
2. **Generation Features** — admin session timeouts, personal workspace timeout, workspace lock/heartbeat/cleanup intervals, audit retention days, commercial workspace key mode, auto-delete-expired/admin-takeover toggles.
3. **Performance & Resource Limits** — see below.
4. **Tool Feature Toggles** — see below.
5. **Face Detection** — YuNet/RetinaFace model paths and thresholds.

### Tool feature toggles

Seven flags that let an admin disable specific *product* features without a redeploy: `enable_quotes_feature`, `enable_baby_photos_feature`, `enable_pdf_output`, `enable_tiff_output`, `enable_alphabetical_sort_option`, `enable_advanced_name_matching`, `enable_custom_font_upload` — plus the two generation-operation toggles `enable_background_removal_ops` / `enable_center_on_face_ops` (grouped under "Generation Features" rather than "Tool Feature Toggles" in the UI, but functionally the same kind of switch).

All of these are exposed to the frontend via **`GET /api/admin/settings/features`** — notably **not** behind the license guard or the admin guard (it doesn't match either's protected-path prefixes), so it's effectively a public read-only endpoint. The frontend (`getAdminFeatureFlags()` in `tool/web/src/api.ts`) fetches it once at startup and **fails open** (defaults every flag to enabled) if the call errors — a deliberate choice so a flaky settings endpoint never silently hides functionality from a user who's supposed to have it.

> **Known inconsistency:** the settings UI describes YuNet as "disabled by default" via an `enable_yunet` flag, but `services/face_detection.py`'s detector-selection code never actually reads that flag — it only checks whether a `yunet_model_path` is configured. Worth fixing if you touch this area; see [`09-conventions-and-known-issues.md`](09-conventions-and-known-issues.md).

## Performance & resource limits

Admin-configurable from the "Performance & Resource Limits" settings card, applied by `services/throttle.py` (CPU/GPU) and `services/bandwidth.py` (network). Env vars only set the *initial* default before anything has been explicitly saved.

- **Network** — `YMGA_NETWORK_UPLOAD_LIMIT_KBPS` / `YMGA_NETWORK_DOWNLOAD_LIMIT_KBPS` (default `0` = unlimited). Enforced by `TrafficMiddleware` (the outermost ASGI middleware, see [`01-architecture.md`](01-architecture.md#backend-request-flow-middleware-stack)) via an async token-bucket per direction (`bandwidth.py`'s `RateBucket`), which allows up to 0.5s of burst above the steady rate and re-reads the configured rate from disk at most once per second so large transfers don't hammer the settings file.
- **CPU** — `YMGA_CPU_MAX_THREADS` (default `0` = all cores), `YMGA_CPU_THROTTLE_PERCENT` (default `100`; lower values insert idle gaps between rendered photos via a duty-cycle sleep), `YMGA_CPU_LOW_PRIORITY` (lowers OS scheduling priority — **on POSIX, raising it back to normal after enabling this typically requires elevated permissions, so disabling "low priority" may need a backend restart to fully take effect**). Applied via `throttle.apply_cpu_limits()`, called at startup, immediately after saving performance settings, and once per generation job.
- **GPU** — `YMGA_GPU_DISABLED` (forces CPU-only inference for background removal/face detection), `YMGA_GPU_THROTTLE_PERCENT` (duty-cycle pacing after each GPU-bound inference call), `YMGA_GPU_MAX_CONCURRENT_OPS` (bounds concurrent GPU inference via a condition-guarded gate, `0` = unlimited).

`cpu_max_threads` also caps ONNX Runtime session thread counts for anything created after the setting changes (`onnx_session_options()`) — this **is not retroactive** to already-open sessions (e.g. `rembg`'s cached model session), which is why some resource-limit changes are documented as needing a restart to fully apply.

## Fonts

`services/fonts.py` enumerates fonts for the **picker UI** only — it is not consulted during rendering. `list_system_fonts()` globs `.ttf`/`.otf` under OS-standard directories (`/usr/share/fonts`, `C:/Windows/Fonts`, `/System/Library/Fonts`, etc., whichever exist on the current OS) and reads each file's family name from its `name` table (falling back to the filename if that fails). `list_workspace_fonts()` globs `fonts/*.*` in the workspace. Actual font *resolution* at render time is a separate code path in `services/generator.py` — see [`02-pipeline.md`](02-pipeline.md#6-styling).

## Testing

`cd tool/server && .venv/bin/python -m pytest`. The suite (`tool/server/tests/`) is organized one file per service/route module, and is thorough enough to be a good source of truth for exact edge-case behavior — a few examples worth knowing about when changing related code:

- `test_mapping_review_shift.py` — pins down the exact shift/shift_up cascade semantics, including the "shift_up twice == shift by −2" equivalence.
- `test_licensing.py` — personal IP/device binding, loopback equivalence, monthly limits, `count_usage` gating, `record_license_seen` not double-counting.
- `test_workspace_registry_dashboard.py` / `test_storage.py` — session listing, stale-binding pruning, expiry-disabled workspaces never being swept by the idle-TTL janitor (but still honoring an explicit end-session).
- `test_placement_order.py` — reading order for both placement modes.
- `test_generator_*.py` — font-stack resolution, baby background-color fill, face-centering math, output-resize downscale-only clamping.
- `test_admin_*_routes.py` — every admin page renders and every settings form round-trips correctly, including the `/api/admin/settings/features` flags.

No frontend test suite exists for `tool/web` — verify frontend changes by running the dev server and exercising the UI (see [`07-development.md`](07-development.md#testing)).
