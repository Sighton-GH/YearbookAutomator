# API reference

All endpoints are served by the FastAPI backend (`tool/server/app/`). Base path in local dev is `http://127.0.0.1:8000` (or same-origin `/api/...` through the Vite proxy at `:5173`). All request/response bodies are **JSON with snake_case fields** unless noted as `multipart/form-data`.

**Guard legend:**
- 🔒 **License** — requires `X-License-Key` header (+ optionally `X-Device-Id`), or `license_key`/`license`/`key` + `device_id` query params as a fallback for contexts that can't set headers (e.g. `<img src>`). See [`03-backend.md`](03-backend.md#license-guard-reason-codes).
- 🛡️ **Admin** — requires an admin session cookie or HTTP Basic auth.
- 🌐 **Public** — no guard.

Full request/response Pydantic models are in `tool/server/app/models/schemas.py` — see [`03-backend.md`](03-backend.md#data-model--pydantic-schemas) for the major ones. The frontend's typed wrapper for every call below lives in `tool/web/src/api.ts`.

---

## Templates — `/api/templates` 🔒

| Method & path | Purpose |
|---|---|
| `POST /parse` | Parse an annotated + clean template pair into slots. Multipart: `annotated_template`/`clean_template` (files, optional if already uploaded for this `workspace_id`), `workspace_id`, `mugshot_color`/`baby_color`/`name_color`/`quote_color` (hex overrides), `disable_baby_photos`/`disable_quotes` (bool), `min_area` (int, default 400). Returns `TemplateParseResponse`. See [`02-pipeline.md`](02-pipeline.md#1-template-parsing). |
| `GET /clean?workspace_id=` | Streams `template_clean.png`. 404 if not yet uploaded. |
| `GET /annotated?workspace_id=` | Streams the saved annotated template. |

## Mapping — `/api/mapping` 🔒

| Method & path | Purpose |
|---|---|
| `POST /ingest` | Roster spreadsheet + portraits ZIP → matched people. Multipart: `spreadsheet`, `workspace_id`, `mugshots_zip`, `naming_pattern` (regex, default `\d{3,4}`), `advanced_name_match` (bool). Returns `SpreadsheetPreview`. See [`02-pipeline.md`](02-pipeline.md#2-spreadsheet--portrait-ingest). |
| `POST /review` | Apply mapping corrections. JSON body `MappingRequest{workspace_id, people, decisions}`. Returns `SpreadsheetPreview`. See [`02-pipeline.md`](02-pipeline.md#3-review-mapping). |
| `POST /upload-quotes-spreadsheet` | Bulk-match a quotes spreadsheet to people by name. Multipart: `workspace_id`, `people_json`, `quotes_spreadsheet`, `advanced_name_match`. |
| `POST /upload-baby-zip` | Bulk-match a baby-photo ZIP to people by filename. Multipart: `workspace_id`, `people_json`, `baby_zip`, `advanced_name_match`, `partial_name_match`, `convert_pdfs`, `remove_background`, `background_mode`. Supports mid-request cancellation (returns `499`) if the client disconnects. |
| `POST /upload-image` | Upload one mugshot/baby image, auto-generating a unique filename. Multipart: `workspace_id`, `kind` (`baby`\|`mugshot`), `file`, `remove_background`, `background_mode`. Returns `{filename}`. |
| `GET/HEAD /asset?workspace_id=&kind=&filename=` | Streams a stored mugshot/baby image. |
| `GET /baby-mask?workspace_id=&x=&y=&width=&height=` | Streams the saved baby-slot cutout mask PNG for these slot coordinates. 404 if no mask was saved at parse time. |
| `POST /detect-face-center` | Detect a face in an arbitrary uploaded image (used by the baby-photo editor). Multipart: `image`. Returns `{found, center_x, center_y, face_width, face_height, detector, detector_rotation_cw, width, height}` or `{found:false, reason}`. |
| `POST /remove-background` | Start an **in-place** background-removal job on an already-uploaded image. Multipart: source ref + `background_mode`. Returns `{job_id, output_filename}`. `403` if the admin `enable_background_removal_ops` flag is off. |
| `GET /remove-background-status?job_id=` | Poll job status. |
| `POST /remove-background-preview` | Same as above but **non-destructive** — result stays in memory rather than being written to disk. Supports `force` to override the "already has alpha" short-circuit. |
| `GET /remove-background-preview-result?job_id=` | Fetch the resulting PNG bytes. `409` if not done yet, **`410` if already fetched once** (read-once semantics — the bytes are cleared from memory after the first successful read). |

## Workspaces — `/api/workspaces` 🔒 (except `/takeover`, which is 🛡️)

| Method & path | Purpose |
|---|---|
| `POST /resolve` | The core session entry point — obtain or create the workspace bound to this license+device. JSON body `{session_id}`. Returns `{ok, workspace_id, license_type, created_new, recreated_after_expiry, state, lock_expires_at, lock_holder_device_id, expires_at_ms, expiry_disabled}`. `409` with `{code:"workspace_locked", ...}` if a commercial license's workspace is checked out elsewhere. See [`01-architecture.md`](01-architecture.md#workspaces--sessions). |
| `POST /touch` | Heartbeat. Multipart: `workspace_id`, `session_id`, `started_at_ms`, `expires_at_ms`. `409` if lock conflict. |
| `POST /release` | Release a commercial workspace's checkout lock. JSON `{workspace_id, session_id}`. |
| `GET /state?workspace_id=` | Fetch the server-side session snapshot (`tool_state` in `meta.json`) — enables cross-device continuation for commercial licenses. Returns `{workspace_id, default_baby_filename, default_mugshot_filenames, session_snapshot, session_updated_at_ms}`. |
| `POST /state` | Persist a session snapshot + default filenames. Merges into `tool_state`. |
| `POST /takeover` 🛡️ | Force-reassign a commercial workspace's lock to the caller. Gated by the admin `enable_admin_workspace_takeover` setting. |
| `POST /end-session` | Request a graceful end (actual deletion happens after a grace period via the cleanup janitor). Multipart: `workspace_id`. |
| `DELETE /{workspace_id}` | Immediate best-effort deletion + registry unregister. |

## Generation — `/api/generation` 🔒

| Method & path | Purpose |
|---|---|
| `POST /generate` | Start a render. JSON body `GenerationRequest` (see [`03-backend.md`](03-backend.md#data-model--pydantic-schemas)). Runs in a background thread. Returns `{job_id, usage?}` — `usage` (`{limit, remaining, period}`) is only present when `count_usage=true` and the license has a usage cap. `401` if usage validation fails. |
| `GET /status?job_id=` | Poll `{workspace_id, progress, status, output, error, updated_at}`. `status` is a free-text progress string until `"done"`/`"error"`. |
| `GET /outputs?workspace_id=` | `{workspace_id, preview, outputs}` — lists rendered files, preferring `output_*.{png,pdf,tif,tiff}` and falling back to a single `output.<ext>`. |
| `GET /download?workspace_id=&filename=output.png` | Streams one file. Returns `{"error": "file not found"}` (HTTP `200`, not `404`) if missing — the frontend checks the body, not the status code. |
| `GET /download-all?workspace_id=` | Streams a `spreads.zip` of every matched output file. |
| `GET /download-spreadsheet?workspace_id=` | Builds and streams an `.xlsx` audit sheet reconstructed from the persisted per-output request payloads. `404` if any output lacks a matching persisted request. |

## Fonts — `/api/fonts` 🔒

| Method & path | Purpose |
|---|---|
| `GET /list?workspace_id=` | `{system: [...], uploaded: [...]}`, each entry `{name, filename, source}`. |
| `POST /upload` | Upload a custom `.ttf`/`.otf`. Multipart: `workspace_id`, `file`. Returns `{filename}`. |
| `GET /get?workspace_id=&filename=` | Streams the raw font file. |

## Licensing (public API) — `/api/licensing` 🌐

| Method & path | Purpose |
|---|---|
| `POST /validate` | JSON `{key}` (+ `X-Device-Id` header). Returns `LicenseValidateResponse{valid, license_type, expires_at, unlock_all_steps, reason}`. Does **not** count as a use. |
| `POST /free-key` | JSON `{accepted_non_commercial_terms}` (+ required `X-Device-Id` header, `400` if missing). Idempotent per `(ip, device_id)` — returns the existing personal key for that binding if one already exists. Returns `{key}`. |

## Feature flags (public API)

| Method & path | Purpose |
|---|---|
| `GET /api/admin/settings/features` 🌐 | Returns every tool feature toggle + workspace timeout setting as JSON (not license- or admin-gated, despite the path). Consumed once at frontend startup; the frontend **fails open** (treats every flag as enabled) if this call errors. See [`03-backend.md`](03-backend.md#tool-feature-toggles). |

## Admin panel — `/admin/*` and `/` 🛡️ (HTML, not JSON)

These render server-side HTML pages, not an API surface meant for programmatic consumption — full breakdown in [`03-backend.md`](03-backend.md#the-admin-panel). Listed here for completeness:

| Page | Route |
|---|---|
| Dashboard | `GET /` (`GET /admin` redirects here) |
| Login / logout | `GET`/`POST /admin/login`, `POST /admin/logout` |
| Usage | `GET /admin/usage` |
| Sessions | `GET /admin/sessions`, `POST /admin/sessions/prune`, `POST /admin/sessions/release`, `POST /admin/sessions/delete` |
| Audit log | `GET /admin/audit?limit=` |
| Licenses | `GET /admin/licenses`, `POST /admin/licenses/create`, `/revoke`, `/delete`, `/update`, `/set-unlock-all`, `/set-workspace-expiry` |
| Settings | `GET /admin/settings`, `POST /admin/settings/auth`, `/face`, `/features`, `/performance`, `/tool-features` |

## Misc

| Method & path | Purpose |
|---|---|
| `GET /health` 🌐 | `{"status": "ok"}` — liveness check, unguarded. |
| `GET /docs`, `/openapi.json`, `/redoc` 🌐 | FastAPI's auto-generated interactive API docs (always allowed through the license guard) — useful for exploring exact schema shapes live against a running backend. |

## URL-builder endpoints (frontend convenience, not separate routes)

`tool/web/src/api.ts` exposes several functions that just **build a URL** rather than making a fetch call — used for `<img src>` and download links, where the license headers can't be attached, so `license_key`/`device_id` are appended as query params instead (`addLicenseParams`): `assetUrl`, `babyMaskUrl`, `templateCleanUrl`, `templateAnnotatedUrl`, `generationDownloadUrl`, `generationDownloadAllUrl`, `generationDownloadSpreadsheetUrl`. These map onto the `GET` endpoints listed above — they're not additional server-side routes.
