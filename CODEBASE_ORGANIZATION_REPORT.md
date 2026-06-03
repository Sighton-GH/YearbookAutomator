# Codebase Organization Report

Date: 2026-02-18  
Repository: `Sighton-GH/YearbookAutomator` (`main`)

## Executive summary

The codebase is functional and logically split by backend routes/services and frontend step components, but complexity is concentrated in a small set of very large files. The biggest organizational risk is **stateful UI orchestration in one mega-component (`web/src/App.tsx`)** plus several large step modules that repeat patterns. On the backend, the main risk is **mixed concerns in oversized route/service files** (especially mapping and licensing).

Overall shape is solid; maintainability would improve significantly with targeted extraction rather than a broad rewrite.

## Measurement snapshot

- Scanned code files (`server/app`, `web/src`): **84**
- Total lines scanned: **21,706**
- Average file size: **258 lines**
- Files >200 lines: **26**
- Files >400 lines: **16**
- Files >800 lines: **5**

### Largest files (outliers)

1. `web/src/App.tsx` — 2,866 lines
2. `web/src/steps/BabyPhotosStep.tsx` — 1,764 lines
3. `web/src/pages/DocumentationPage.tsx` — 1,486 lines
4. `web/src/steps/MugshotMapping.tsx` — 1,111 lines
5. `web/src/components/BabyPhotoEditor.tsx` — 962 lines
6. `server/app/routes/mapping.py` — 745 lines
7. `web/src/steps/TemplateParsing.tsx` — 677 lines
8. `server/app/services/generator.py` — 618 lines
9. `web/src/api.ts` — 594 lines
10. `server/app/routes/licensing.py` — 560 lines

### Complexity indicators in key files

- `web/src/App.tsx`:
  - `useState`: 38
  - `useEffect`: 24
  - many local helpers handling navigation, session persistence, import/export, generation orchestration
- `web/src/steps/BabyPhotosStep.tsx`:
  - `useState`: 23
  - `useEffect`: 7
  - blends ingest, editor UX, async job polling, and UI rendering
- `server/app/routes/mapping.py`:
  - 12 top-level `def`
  - includes request handlers plus matching/token logic and PDF conversion helpers
- `server/app/services/generator.py`:
  - 27 top-level `def`
  - includes GPU/OpenCL toggles, font resolution, text wrapping, image fit, slot/mask handling, final generation

## What is organized well already

- Backend structure (`routes` delegating to `services`) is conceptually correct.
- Domain concepts are clear (`template_parser`, `placement`, `mapping_review`, `progress`, `storage`).
- Frontend step folders communicate workflow intent.
- Shared API contracts are explicit and mostly centralized.
- Test suite covers many backend algorithms/services.

## Primary organization issues

## 1) Frontend orchestration bottleneck (`web/src/App.tsx`)

`App.tsx` is currently acting as:

- global state container,
- workflow state machine,
- session persistence layer,
- config import/export coordinator,
- API side-effect orchestrator,
- and page-level renderer.

This is the strongest candidate for splitting.

### Recommended split

Create `web/src/features/tool/` with:

- `state/useToolSessionState.ts` (session/workspace identity, TTL, heartbeat)
- `state/useToolWorkflow.ts` (step skip/ready/next/prev/goTo logic)
- `state/useToolPersistence.ts` (save/restore config/session payload mapping)
- `state/useToolGeneration.ts` (start render, poll status, output updates)
- `components/ToolStepperShell.tsx` (layout + nav + action bars)

Keep `App.tsx` as a thin composition root.

## 2) Duplicate-heavy step logic (baby/mapping/editor)

`BabyPhotosStep.tsx`, `MugshotMapping.tsx`, and `BabyPhotoEditor.tsx` overlap in concerns:

- preview dialogs,
- per-person image updates,
- background-removal async polling,
- crop/editor interaction state,
- warning/confirm UX patterns.

### Recommended split

- Add shared hooks in `web/src/features/media/`:
  - `useBackgroundRemovalJob.ts`
  - `useImagePreviewDialog.ts`
  - `usePeopleImageAssignments.ts`
- Extract reusable UI blocks:
  - `DefaultImageAssignmentPanel.tsx`
  - `WarningsSummaryPanel.tsx`
  - `StepStatusPanel.tsx`

This should reduce duplicate async orchestration and cut regression risk.

## 3) Backend route files mixing transport + domain logic

`server/app/routes/mapping.py` currently contains:

- HTTP handlers,
- filename/name normalization and fuzzy matching helpers,
- PDF conversion helper,
- background job setup logic.

### Recommended split

- Keep route handlers in `routes/mapping.py`.
- Move helper logic to services:
  - `services/name_matching.py` (normalize/tokens/partial similarity)
  - `services/pdf_preview.py` (PDF first-page conversion)
  - `services/mapping_assets.py` (asset lookup helpers)

Route should mostly validate request + call service + translate errors.

## 4) Backend service files with multiple subdomains

### `server/app/services/generator.py`

Contains rendering pipeline plus many independent utility families.

Recommended decomposition:

- `services/generation/fonts.py`
- `services/generation/text_layout.py`
- `services/generation/image_fit.py`
- `services/generation/baby_masks.py`
- `services/generation/engine.py` (compose operations)

### `server/app/routes/licensing.py`

Contains admin auth session mechanics, HTML rendering, and API endpoints together.

Recommended decomposition:

- `routes/admin_auth.py` (cookie + auth helpers/endpoints)
- `routes/admin_licenses.py` (admin pages/actions)
- `routes/api_licensing.py` (validate/free-key APIs)
- `services/admin_views.py` (HTML fragment/layout builders)

## 5) API client growth pressure (`web/src/api.ts`)

`api.ts` is a monolithic client handling all domains.

Recommended decomposition:

- `web/src/api/client.ts` (axios instance + interceptors)
- `web/src/api/types.ts` (shared TS contracts)
- `web/src/api/templates.ts`
- `web/src/api/mapping.ts`
- `web/src/api/generation.ts`
- `web/src/api/workspaces.ts`
- `web/src/api/fonts.ts`
- `web/src/api/licensing.ts`
- barrel export `web/src/api/index.ts`

## 6) Documentation page is long but lower risk

`web/src/pages/DocumentationPage.tsx` is very long, but much of it is static content. This is less risky than core workflow files.

Suggested change (optional): move section bodies into markdown-like content modules (`web/src/content/docs/*.tsx` or JSON/MD sources) to reduce noise in the page component.

## Folder-level hotspots

- `web/src/steps`: 5,035 lines across 9 files (avg 559)
- `server/app/services`: 4,071 lines across 18 files
- `server/app/routes`: 2,153 lines across 8 files
- `web/src/App.tsx` alone: 2,866 lines

Interpretation: complexity is concentrated in workflow-heavy frontend files and a few backend boundary files.

## Priority refactor plan (phased)

## Phase 1 (highest ROI, low architecture risk)

1. Split `web/src/App.tsx` into state hooks + shell component.
2. Split `web/src/api.ts` by domain.
3. Extract reusable polling/preview hooks from baby/mapping steps.

Success criteria:

- `App.tsx` < 900 lines
- `api.ts` eliminated in favor of domain modules
- no behavior change; tests/build green

## Phase 2 (backend boundary cleanup)

1. Move matching helpers from `routes/mapping.py` to `services/name_matching.py`.
2. Move PDF conversion helper out of route.
3. Keep route functions thin and transport-focused.

Success criteria:

- `routes/mapping.py` < 350 lines
- clear service-level unit tests for extracted helpers

## Phase 3 (rendering pipeline modularization)

1. Break `services/generator.py` into focused modules.
2. Keep one orchestration entrypoint for generation flow.

Success criteria:

- `generator.py` replaced by `generation/engine.py` + focused modules
- existing generation tests continue to pass

## Suggested size thresholds going forward

Pragmatic thresholds for this project:

- Prefer warning at **>400 lines** for feature files.
- Require split discussion at **>700 lines**.
- For React components, target **<300 lines** when stateful.
- For route files, keep to endpoint transport logic and avoid embedding algorithms.

## Risks and migration notes

- Biggest risk is accidental behavior drift in session/config restoration paths.
- Preserve API contracts exactly (snake_case payload fields) while splitting clients.
- Prefer extract-and-re-export approach first to keep import churn manageable.
- Add lightweight frontend tests around workflow transitions before deep split of `App.tsx`.

## Recommended first concrete tasks

1. Introduce `web/src/features/tool/state/useToolWorkflow.ts` and move step skip/ready/navigation logic there.
2. Introduce `web/src/api/client.ts` and migrate one domain (`workspaces`) as a pilot.
3. Extract name matching helpers from `server/app/routes/mapping.py` into `server/app/services/name_matching.py` with tests.

These three changes will provide immediate maintainability gains without changing user-visible behavior.
