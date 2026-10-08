# Handoff: Custom Flow Automator — Plan 3 (bugs), Plan 2 (features), UX review

Read this file first, then the three spec sheets in this folder (`docs/specs/glm-2026-10/` in the repository). You may work on all of them at once; this file says how they fit together and what to hand back.

| File | What it is | Delivers |
|---|---|---|
| `01-plan3-remaining-bugs.md` | 24 remaining defects from a full audit | Code + tests |
| `02-plan2-customisation-features.md` | 4 feature groups for spread customisation | Code + tests |
| `03-ux-walkthrough-review.md` | Act as a real teacher using the UI, with screenshots | Report + screenshots (branch `glm/ux-review`) |

## 1. The product in one paragraph

"Custom Flow Automator" (company: "Sighton Yearbook Tools") builds school-yearbook spreads. A yearbook editor uploads an *annotated* template image with coloured guide boxes (portrait green `#00bf63`, baby photo blue `#004aad`, name orange `#ff751f`, quote red `#ff3131`), a *clean* template (the background art), a roster spreadsheet, a ZIP of portraits, and optionally a quotes spreadsheet and a ZIP of baby photos. The tool detects the slots, matches people to photos and quotes, lets the user review and style everything, and renders finished spreads as PNG/PDF/TIFF. Users are school staff and teachers, not developers. Read `CLAUDE.md` at the repo root for the architecture before changing code.

## 2. Base code

- Repository: **https://github.com/Sighton-GH/YearbookAutomator** (private — use the access you were given).
- Base: the git tag **`glm-base-2026-10`** (on `main`; the audit bug-fix pass plus these spec sheets). Every change must apply on top of it:
  ```bash
  git clone https://github.com/Sighton-GH/YearbookAutomator.git yearbook && cd yearbook
  git checkout -b glm/plans-2-3 glm-base-2026-10
  ```
- These spec sheets are in the repo at `docs/specs/glm-2026-10/`.
- Stack: Python 3.12 (avoid 3.13+) FastAPI backend in `tool/server/`; React 18 + TypeScript + Vite frontend in `tool/web/`. The marketing site in `website/` is out of scope; do not touch it.

## 3. Data rule (non-negotiable)

This product handles student photos and names. You must use **only fictional or generated data**:
- The bundled fictional sample: `tool/web/public/assets/sample/` (`sample-roster.csv`, `sample-portraits.zip`) and the sample templates `tool/web/public/assets/Annotated Sample.webp` / `Clean Sample.webp` (convert to PNG before uploading; see §5).
- Synthetic data you generate (see Plan 3 task P3-00, which builds a generator).
- Never search for, download, or ask for real student photos, rosters or quotes. Do not upload anything to third-party services.

## 4. Environment setup (your machine)

```bash
# Backend
cd tool/server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
mkdir -p ~/ymga-dev/data ~/ymga-dev/licenses
export YMGA_WORKSPACE_DATA_DIR=~/ymga-dev/data
export YMGA_LICENSE_STORE_DIR=~/ymga-dev/licenses
export YMGA_LICENSE_SECRET=dev-secret
export YMGA_LICENSE_ADMIN_USERNAME=admin YMGA_LICENSE_ADMIN_PASSWORD=dev-admin
export YMGA_CLEAR_WORKSPACES_ON_STARTUP=false
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000      # leave running

# A licence key for the UI (same env vars as above in that shell)
.venv/bin/python -c "from app.services import licensing; print(licensing.create_license(license_type='commercial', note='glm-dev'))"
# Commercial keys lock to one browser/device at a time: use a new key per fresh browser profile.

# Frontend (second shell)
cd tool/web
npm install
npm run dev            # http://127.0.0.1:5173, proxies /api -> 127.0.0.1:8000
```
- Admin panel: `http://127.0.0.1:8000/` with the admin username/password above (feature toggles live under `/admin/settings`).
- First background-removal "Ultra" run downloads a model (slow, one time); that is expected.

## 5. Gates (all must pass before you deliver)

```bash
cd tool/server && .venv/bin/python -m pytest -q
cd tool/web && npx tsc --noEmit -p . && npx eslint . --max-warnings 7 && npm run build
cd tool/web && npx playwright test          # the e2e suite you add in P3-00
```
- Baseline at `glm-base-2026-10`: 184 backend tests pass, `tsc` clean, ESLint 0 errors / 7 warnings. Do not add warnings.
- Backend tests must never touch real data: monkeypatch `storage.BASE_DATA` to a tmp dir (see `tool/server/tests/test_storage.py`); route tests use `tool/server/live_test_client.py` as in `tool/server/tests/test_generation_outputs.py`.
- Template-parser tests build synthetic images with OpenCV (see `tests/test_template_parser.py`); no binary fixtures for those.
- WebP sample templates: the backend's template parser expects PNG/JPEG uploads from the UI; in tests and e2e convert with Pillow (`Image.open(p).save(out, "PNG")`).

## 6. Conventions (from the codebase)

- API payloads are snake_case end-to-end. Every field added to `tool/server/app/models/schemas.py` must be mirrored by hand in `tool/web/src/types.ts` and/or `tool/web/src/api.ts` (no codegen).
- Routes in `tool/server/app/routes/` stay thin; logic goes in `tool/server/app/services/`.
- User-facing text is plain English for school staff: no raw error codes, exception names or "HTTP 500". Known server codes are translated in `tool/web/src/configFile.ts` → `FRIENDLY_SERVER_CODES`; add new ones there.
- Product strings: "Custom Flow Automator" / "Sighton Yearbook Tools" only.
- New user settings must (a) persist in the session (`tool/web/src/session.ts` `PersistedSessionV1`, written by `buildSessionPayload` and restored by `applyImportedSession` / the restore effect in `App.tsx`), (b) round-trip through config export/import (`configFile.ts`, `configImport.ts`), and (c) default to today's behaviour so old saved sessions render identically.
- `App.tsx` (~3.2k lines), `ImportStep.tsx`, `PeopleTab.tsx`, `generator.py`, `routes/mapping.py` are oversized. Prefer adding new focused files (components, `utils/*.ts`, `services/*.py`) over growing them, but do not restructure unrelated code.
- No new runtime dependencies unless a spec item explicitly allows one. Allowed dev dependency: `@playwright/test`.

## 7. How the specs combine

Apply in this order when they touch the same code: **Plan 3 first, then Plan 2.** Known overlaps (resolved here so you don't have to guess):
- Generation warnings: P3-03 adds a `warnings: list[str]` to the generation job status. Plan 2 features that can fall back (fonts, emoji glyphs, face crop) append to that same list.
- PDF/PNG print resolution: P3-12 writes correct DPI metadata with a fixed 300 dpi. Plan 2 F4.3 makes the DPI user-selectable and replaces the constant with the setting.
- Default quote: P3-01 adds a warning when students will get the default quote (the default itself stays). Plan 2 does not change default quotes.
- Slot assignment: Plan 2 F2.5 (move a student to a specific slot) is the only UI that writes `slot_assignments`; placement collision handling already exists in `tool/server/app/services/placement.py` (explicit assignments claim first) — reuse it.
- People-step state: P3-05 lifts staged People adjustments into `App` state; Plan 2's per-student edits (F2.x) must use that lifted state, not new local state in `PeopleTab.tsx`.

## 8. What to hand back (via GitHub — no files to copy)

1. **Code:** push branch **`glm/plans-2-3`** (based on `glm-base-2026-10`) to the repository. One commit per spec item, subject prefixed with its ID, e.g. `P3-07: unify face detection between editor and render`, `F1.2: text colour for names and quotes`.
2. **`DELIVERY.md`** committed on that branch at `docs/specs/glm-2026-10/DELIVERY.md`: for every item ID — status (done / partial / skipped), what changed (files), tests added, and anything you decided that the spec left open. List every deviation from a spec with the reason. Paste the final gate output (§5) at the end.
3. **Open a draft pull request** from `glm/plans-2-3` into `main` titled "GLM: Plan 3 fixes + Plan 2 customisation features", with `DELIVERY.md`'s summary as the description. **Do not merge it, do not push to `main`, do not force-push or delete any existing branch or tag.**
4. **UX review:** push the `ux-review/` folder (as described in `03-ux-walkthrough-review.md`, including screenshots) to a separate branch **`glm/ux-review`** created from `glm-base-2026-10`, under `ux-review/`. Keep screenshots out of `glm/plans-2-3`. Link that branch in the pull request description.

Do not commit screenshots, generated data, `node_modules`, `.venv` or `dist` to `glm/plans-2-3`.
