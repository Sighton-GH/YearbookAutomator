# Developer Documentation

This is the developer documentation for the **Yearbook Grad Mugshot Automator** repository. It's written for engineers who need to understand, extend, or operate the codebase — not for end users of the tool (end-user docs live on the marketing site's Documentation page, see [`06-website.md`](06-website.md#components-srccomponents)).

If you only read one page, read this one and [`01-architecture.md`](01-architecture.md). Everything else drills into a specific subsystem.

## What this is

The **Yearbook Grad Mugshot Automator** ("Custom Flow Automator", branded site-wide as **Sighton Yearbook Tools**) is a tool that turns a stack of raw ingredients into finished yearbook grad spreads:

- an **annotated template image** — the spread's background art with coloured guide rectangles drawn on top, marking where each student's portrait, baby photo, name, and quote should go,
- a **clean template image** — the same background art without the guide rectangles (what actually gets rendered on),
- a **roster spreadsheet** (`.xlsx`/`.csv`) — one row per student,
- a **ZIP of portrait photos**, and optionally a **ZIP of baby photos** and a **quotes spreadsheet**.

It detects the coloured guide boxes by computer vision, matches students to their photos (by filename number or by name), lets a human review/fix the matches, and then composites finished spread images (PNG/PDF/TIFF) — one image per "spread" of students — ready to send to a yearbook printer.

It is a hosted service: a school's browser sends roster and image data over HTTPS to an access-controlled workspace on the Canadian production server. See [`../PRIVACY.md`](../PRIVACY.md) for processing and retention details.

## Repo layout

This repository contains **two independently-deployable applications** that share no build step or runtime — they only talk to each other over a couple of absolute URLs (see [Cross-project wiring](01-architecture.md#cross-project-wiring)):

| Path | What it is | Docs |
|---|---|---|
| [`tool/server/`](../tool/server/) | FastAPI backend — the "engine": template parsing, matching, rendering, licensing, admin panel | [`03-backend.md`](03-backend.md) |
| [`tool/web/`](../tool/web/) | React/Vite frontend — the "wizard": the 5-step guided UI end users interact with | [`05-frontend.md`](05-frontend.md) |
| [`website/`](../website/) | Astro marketing/info site (About, Documentation, Pricing, License, Privacy) — static, no backend, no license logic | [`06-website.md`](06-website.md) |

`tool/server` + `tool/web` together are referred to as **"the tool"** throughout this documentation. `website` is referred to as **"the website"**.

## Documentation index

1. [**Architecture**](01-architecture.md) — how the pieces fit together: tool vs. website, backend request flow (middleware stack), the workspace/session concept, storage layout, production topology.
2. [**The generation pipeline**](02-pipeline.md) — a deep walkthrough of every stage from template upload to finished spread: the colour-detection algorithm, name/photo matching, mapping review, styling, and the rendering pipeline itself.
3. [**Backend reference**](03-backend.md) — `tool/server` module-by-module: routes, services, data model, storage, licensing, workspace sessions, the admin panel, and performance/resource throttling.
4. [**API reference**](04-api-reference.md) — every HTTP endpoint the backend exposes, grouped by domain, with request/response shapes.
5. [**Frontend reference**](05-frontend.md) — `tool/web` module-by-module: the `App.tsx` state machine, the 5-step roadmap UI and component reuse, session persistence, config import/export, licensing UI, theming, and onboarding.
6. [**Website reference**](06-website.md) — `website` pages/components, branding strings, and how it links to the tool.
7. [**Development setup**](07-development.md) — running everything locally, environment variables, GPU acceleration, and the test suites.
8. [**Deployment**](08-deployment.md) — how the live production instance is actually hosted and how to update it.
9. [**Conventions & known issues**](09-conventions-and-known-issues.md) — coding conventions, structural debt, and specific gotchas worth knowing before you touch certain files.

## Orientation in 60 seconds

- **Everything is scoped to a workspace.** A `workspace_id` is the unit of storage on the backend (`tool/server/app/data/<workspace_id>/`) and the unit of state on the frontend. Understand workspaces first — see [Architecture § Workspaces](01-architecture.md#workspaces--sessions).
- **The backend is routes-delegate-to-services.** `tool/server/app/routes/*.py` is thin HTTP glue; `tool/server/app/services/*.py` is where the actual logic (computer vision, matching, rendering, licensing) lives.
- **The frontend is one big state machine.** `tool/web/src/App.tsx` (~3,100 lines) owns almost all state and orchestration for the 5-step UI. This is intentional, documented existing structure, not an accident — see [`09-conventions-and-known-issues.md`](09-conventions-and-known-issues.md).
- **The 5 UI steps reuse 3 underlying components.** Template/People/Style all render the *same* `EditStep` component pinned to a different internal tab. Don't go looking for 5 separate step components — see [Frontend § Step-to-component map](05-frontend.md#step-to-component-map).
- **Nothing here talks to the internet by default.** Background removal and face detection run local ONNX models; the only external calls are the two cross-project links (tool ↔ website) and the licensing endpoints, which are self-hosted on the same backend.

## Conventions used in these docs

- File references use the form `path/to/file.py:123` (path relative to repo root, line number where useful and stable).
- API payload fields are always shown in the wire format: **snake_case**, matching Pydantic models on the backend exactly — the frontend's TypeScript types mirror them manually (no codegen), see [Backend § Data model](03-backend.md#data-model--pydantic-schemas).
- "The tool" = `tool/server` + `tool/web` together, as delivered to an end user. "The backend" / "the frontend" refer to one half specifically.
- Where behavior is env-var-configurable, the env var name is given exactly as read by `os.getenv(...)` in the code — grep for it if you need the current default, since these docs summarize but the code is the source of truth for defaults that change often.
