# Repository Guidelines

## Project Structure & Module Organization

- `tool/server/` is the Python 3.12 FastAPI backend. `app/routes/` defines HTTP endpoints, `app/services/` contains processing and storage logic, and `app/models/` holds Pydantic schemas. Backend tests live in `tool/server/tests/`.
- `tool/web/` is the React 18/TypeScript/Vite application. Place reusable UI in `src/components/`, workflow views in `src/steps/`, and API access in `src/api.ts`.
- `website/` is the independently built Astro marketing site. Routes are in `src/pages/`, React islands in `src/components/`, and static assets in `public/`.
- `docs/` contains architecture, API, development, and deployment details; `deploy/systemd/` contains production service units.

## Build, Test, and Development Commands

Use Python 3.12 and Node 22.12 or newer. From the repository root:

```sh
bash start-dev.sh
cd tool/server && .venv/bin/python -m pytest
cd tool/web && npm ci && npm run test:server && npm run lint && npm run build
cd website && npm ci && npm run build
```

`start-dev.sh` starts FastAPI and the tool UI together. Run `npm run dev` inside either frontend for its local server (`:5173` for the tool, `:4321` for the website). Use `website`'s `npm run cf:dev` to validate the Cloudflare runtime.

## Coding Style & Naming Conventions

Follow existing files: four-space indentation and `snake_case` for Python; two-space indentation, double quotes, and semicolons for TypeScript/TSX. Name React components and their files in `PascalCase`, utilities in `camelCase`, and tests `test_<behavior>.py`. Keep API payload fields `snake_case` across Pydantic and TypeScript. Run the tool frontend's ESLint command before submitting changes. Avoid broad refactors in large workflow and generator files unless the change specifically requires one.

## Testing Guidelines

Use Pytest for the backend and Node's test runner for the production frontend server. Add backend coverage beside related tests and use `tmp_path`/monkeypatching instead of real `app/data/`; parser tests should construct synthetic OpenCV images where practical. Run `npm run test:server` for static-serving, proxy, host, and path controls. For UI changes, also run lint/build and exercise the affected browser flow; include screenshots for visible changes.

## Commit & Pull Request Guidelines

Recent history favors concise Conventional Commit subjects such as `feat:`, `fix:`, and `chore:`; use an optional scope when useful. Keep commits focused. Pull requests should explain intent and user impact, list verification performed, link relevant issues, and call out API, configuration, or storage changes.

## Security & Configuration

Never commit real license keys, secrets, `.env` files, or generated student/workspace data. Copy the relevant `.env.example` for local configuration. Starting the backend clears workspace directories by default; check for a production service sharing `tool/server/app/data/` before launching locally.
