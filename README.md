

# Yearbook Grad Mugshot Automator

**A local-first, step-by-step yearbook spread generator.**

This app takes:

- an **annotated template image** (your spread with coloured guide boxes),
- a **clean template image** (the actual background art you want in the final output),
- a **spreadsheet** of students,
- and one or more **ZIPs of images** (portraits / baby photos),

…then automatically generates finished, consistent yearbook spreads.

It is built with FastAPI (Python backend) and React/Vite (frontend), and is designed to be **local-first** (student data stays on your machine in normal use).

## Repo layout

This repo has two independently-deployable halves:

- [`tool/`](tool/) — the actual product: FastAPI backend (`tool/server/`) + React/Vite frontend (`tool/web/`). This is what the rest of this README documents.
- [`website/`](website/) — the marketing/info site (About, Documentation, Pricing, License, Privacy pages), built with Astro. It's a static site with no backend of its own and no license logic — every "Tool" link/CTA just points at wherever `tool/web` is deployed. Meant to be deployed separately, to Cloudflare Workers (static assets, via `wrangler deploy`). See [website/README.md](website/README.md) for its own quickstart.

The two only talk to each other over absolute URLs configured via `.env` files (see `tool/web/.env.example` and `website/.env.example`) — there is no shared build step.

---

## Quickstart

### 1. Backend (FastAPI)

**Important:** Use Python 3.12 (not 3.13+) to avoid dependency compatibility issues.

#### Windows
```sh
cd tool\server
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**One-line start (after venv is set up):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd "C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\server"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Linux
```sh
cd tool/server
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**One-line start (after venv is set up):**
```sh
cd tool/server && .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Or use the combined startup script (starts both frontend and backend):**
```sh
bash start-dev.sh
```

**Note:** Binds to `0.0.0.0` for Tailscale access. Always use `.venv/bin/python` explicitly to ensure uvicorn subprocesses use the correct Python version.

**GPU acceleration on Linux (NVIDIA):**
The Linux requirements automatically install `onnxruntime-gpu`. For CUDA-accelerated background removal and face detection, ensure you have the matching CUDA toolkit and cuDNN runtime installed. Verify GPU is detected at runtime:
```sh
python -c "import onnxruntime; print(onnxruntime.get_available_providers())"
# Should include: CUDAExecutionProvider
```
To force CUDA at runtime: `YMGA_REMBG_PROVIDER=CUDAExecutionProvider`

**Note:** Binds to `0.0.0.0` for Tailscale access. Always use `.venv\Scripts\python.exe` explicitly to ensure uvicorn subprocesses use the correct Python version.

**Optional GPU acceleration (background removal):**
Ultra-complex background removal uses an ONNX model. On Windows, the recommended GPU path is **DirectML** via `onnxruntime-directml` (listed in requirements). This works on most GPUs that support DirectX 12 (feature level 11_0+). If you prefer CUDA on a supported NVIDIA GPU, swap `onnxruntime-directml` for `onnxruntime-gpu` and install the matching CUDA/cuDNN runtime. If no GPU provider is available, the server falls back to CPU automatically.

To force DirectML at runtime, set:
`YMGA_REMBG_PROVIDER=DmlExecutionProvider`

### 2. Frontend (React/Vite)

```sh
cd tool/web
npm install
npm run dev
```

**One-line start — Windows (after npm install):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd "C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\web"; npm run dev
```

**One-line start — Linux (after npm install):**
```sh
cd tool/web && npm run dev
```

The frontend runs at http://localhost:5173 (also accessible via Tailscale at `http://<your-tailscale-ip>:5173`) and proxies `/api` to the backend.

This is the tool's interactive app (the stepper UI), mounted at its own root rather than embedded in the marketing site. License key entry and validation happen here, not on the website — every "Tool" link/CTA on the marketing website (see [website/](website/)) is a plain link to wherever this is deployed (`PUBLIC_TOOL_URL` in [website/.env.example](website/.env.example)); the "back to main site" link here points the other way (`VITE_WEBSITE_URL` in [tool/web/.env.example](tool/web/.env.example)).

---

## Licensing (Tool Lock)

The tool app (`tool/web`) is locked behind a license key — the website carries no licensing code at all, it just links to the tool.

- The UI prompts for a key the first time you open the Tool.
- You can request a **free personal (non-commercial)** key from that same screen.
	- This creates (or reuses) a **unique personal key** tied to your device.
- The backend also enforces licensing: tool APIs require an `X-License-Key` header.

### Admin panel (create/revoke keys)

- Admin home URL: http://127.0.0.1:8000/
- License admin URL: http://127.0.0.1:8000/admin/licenses
- Admin settings URL: http://127.0.0.1:8000/admin/settings
- Set admin username default: `YMGA_LICENSE_ADMIN_USERNAME` (default: `admin`)
- Set admin password: `YMGA_LICENSE_ADMIN_PASSWORD`
	- Admin pages trigger the browser login prompt immediately on first open in a browser/session.
	- Username can be changed in the admin settings panel and is persisted server-side.
	- `start-dev.cmd` sets local dev defaults: username `sighton_admin`, password `Sighton!2026`.
- Admin session timeout controls:
	- `YMGA_ADMIN_IDLE_TIMEOUT_SECONDS` (default: `900`)
	- `YMGA_ADMIN_MAX_SESSION_SECONDS` (default: `28800`)
	- Optional signing secret override: `YMGA_ADMIN_SESSION_SECRET`
	- These can be adjusted in the admin settings panel and are persisted server-side.
- Admin generation operations are controlled separately:
	- Background removal operations
	- Center-on-face operations

### License persistence & secrets

- Recommended: set `YMGA_LICENSE_SECRET` to keep keys stable across restarts.
- If `YMGA_LICENSE_SECRET` is not set, the server generates a secret once and stores it at `tool/server/app/data/_licenses/secret.txt`.
- License records are stored at `tool/server/app/data/_licenses/licenses.json`.
	- Note: license keys are stored in plaintext in this file so they can be recovered/viewed in the admin panel.
- For tests or custom deployments, you can override the store directory with `YMGA_LICENSE_STORE_DIR`.

### Usage tracking / limits

- The backend middleware records usage each time a protected tool API endpoint is called with a valid key.
- Personal keys are limited to **5 uses per month** by default (configurable via `YMGA_PERSONAL_MONTHLY_LIMIT`).
- The admin panel shows the **last 500 usage events**; the backend retains the **last 2000** in `tool/server/app/data/_licenses/usage.json`.
- You can optionally set per-key max uses from the admin panel when creating a key.

---

## End-to-End Workflow

The UI is a guided stepper. Under the hood, each step is simply preparing data for the next step:

1. **Template parsing**
	- You upload both files: **Annotated Template** (with coloured rectangles) and **Clean Template** (background art).
	- The backend detects mugshot/baby/name/quote regions by **colour**, groups them into per-student "slots", and saves masks for baby-photo cutouts.
2. **Spreadsheet + portrait ingest**
	- You upload a roster spreadsheet (`.xlsx` or `.csv`) and a portrait ZIP.
	- The backend extracts images and attempts to match each student row to a portrait.
3. **Review mapping**
	- You can “keep/replace/shift/skip” portrait assignments.
	- Shifts cascade downward, which is useful when someone is missing a portrait.
4. **Quotes (optional)**
	- Upload a quotes spreadsheet; the backend matches quotes to people by name.
5. **Baby photos (optional)**
	- Upload a baby-photo ZIP; the backend matches by filename tokens (with optional fuzzy matching).
6. **Styling**
	- Choose fonts/sizes/alignment/casing for name and quote rendering.
7. **Review & generate**
	- Generate a preview first, then render the full output.
	- Generation runs in a background thread and progress is polled.
8. **Results**
	- Download the final PNG(s) (or a ZIP for multiple spreads).

---

## How It Works (Code & Algorithms)

### Architecture (in plain language)

The app is split into a backend “engine” and a frontend “wizard”:

- The **frontend** is a step-by-step UI that collects your files and settings.
- The **backend** does the heavy lifting: image processing, matching, rendering, and saving outputs.

The two talk over HTTP. In local development, the browser talks to Vite (`localhost:5173`) and Vite proxies API calls to FastAPI (`127.0.0.1:8000`).

- **Backend**: FastAPI app in `tool/server/app/main.py` wires routers under `tool/server/app/routes/`. Core logic lives in `tool/server/app/services/`.
- **Frontend**: React app in `tool/web/src/App.tsx` implements a stepper UI, calling backend APIs via `tool/web/src/api.ts`.
- **Data Model**: Shared Pydantic models in `tool/server/app/models/schemas.py` define slots, people, mapping, and generation payloads. API contracts are tightly aligned with frontend types.
- **Storage**: Each workspace lives in `tool/server/app/data/<workspace_id>/` with subfolders for mugshots, baby, fonts, masks, and uploads.

### Key concept: workspaces

Every request is scoped to a `workspace_id`:

- When you upload templates/ZIPs/spreadsheets, the backend saves them into that workspace folder.
- When you preview or generate, the backend reads from that workspace folder.
- Workspaces can be cleaned up automatically (configurable). This is important for privacy and for keeping disk usage sane.

### Template Parsing

- **Endpoint**: `POST /api/templates/parse`
- **What you upload**: two images
  - **Annotated Template**: contains only guide rectangles (or guide rectangles over your design). This file teaches the system “where things go”.
  - **Clean Template**: the background art the final spread is rendered on top of.
- **Algorithm**: Uses OpenCV to detect coloured rectangles in the annotated template (by HSV thresholding):
	- Mugshot: green (`#00bf63`), Baby: blue (`#004aad`), Name: orange (`#ff751f`), Quote: red (`#ff3131`). Custom hex colours are supported.
	- Tolerance sweeps: If no boxes are found with the given colour, the backend retries with increasing HSV tolerance, then falls back to defaults.
	- **Required**: At least one name and one quote box must be detected, or parsing fails.
	- **Slot Grouping**: Boxes are grouped by proximity (reading order: top-to-bottom, left-to-right). Each slot is a tuple of mugshot, baby, name, and quote boxes.
	- **Scaling**: If the clean template is a different size, all boxes are scaled to match.
	- **Baby Masks**: For each baby slot, a filled mask is saved for later use (supports non-rectangular cutouts).

In other words: you "draw" the layout once with coloured rectangles, and the generator reuses those coordinates every time you re-run.

### Spreadsheet Ingest & Mapping

- **Endpoint**: `POST /api/mapping/ingest`
- **Spreadsheet**: Must have "first name" and "last name" columns. Each row becomes one `PersonRecord`.
- **Mugshot ZIP**: The backend extracts images and assigns them to people.
	- The default mode expects numeric filenames that correspond to spreadsheet rows.
	- Optional matching modes can use name tokens to match files like `"Smith, John.jpg"` to `John Smith`.
- **Review**: The `/review` endpoint lets you adjust assignments (replace, shift, skip, keep). Shifting cascades blanks downward.
- **Baby/Quote Ingest**: Upload a ZIP of baby photos or a spreadsheet of quotes. The backend matches by name (with advanced/partial matching for fuzzy cases) and updates the people list.
- **Uploads**: `/upload-image` stores extra mugshot/baby images; `/asset` streams them back for preview.

### Generation & Progress

- **Endpoint**: `POST /api/generation/generate`
- **Threaded**: Generation runs in a background thread; progress is tracked via `/status`.

**What generation does** (human version):

For each student slot, the backend:

	- Mugshot and baby images are centre-cropped to fit the slot.
	- Baby slots use per-slot masks for non-rectangular cutouts (ellipse, triangle, etc).
	- Text is rendered with Pillow, using the selected font, size, alignment, and all-caps options. Name and quote styles are independent.
	- Output is saved as `output.png` (or `output_*.png` for multi-spread).

If you have more students than fit in one spread, the frontend chunks the people list and renders multiple outputs.

### Fonts

- **System Fonts**: Enumerated from system directories (Windows, macOS, Linux).
- **Custom Fonts**: Upload TTF/OTF files per workspace. The backend loads uploaded fonts first, then system fonts, then falls back to Pillow's default.
- **Endpoints**: `/api/fonts/list`, `/api/fonts/upload`, `/api/fonts/get`.

### Where the “logic” lives

If you’re trying to understand the codebase quickly, these files are the main landmarks:

- `tool/server/app/routes/*.py`: API endpoints (FastAPI routers)
- `tool/server/app/services/template_parser.py`: colour detection + slot extraction
- `tool/server/app/services/spreadsheet.py`: roster/quotes parsing + name normalization
- `tool/server/app/services/generator.py`: image/text compositing pipeline
- `tool/server/app/services/placement.py`: ordering/placement logic for slots/people
- `tool/server/app/services/progress.py`: in-memory job status for generation
- `tool/server/app/services/storage.py`: workspace paths + saving uploads
- `tool/web/src/App.tsx`: the stepper UI (states, uploads, review, generate)
- `tool/web/src/api.ts`: typed API client used by the UI

### Storage Layout

- `tool/server/app/data/<workspace_id>/`
	- `template_clean.png` — Clean template image
	- `uploads/` — All uploaded files (annotated/clean templates, mugshots.zip, baby.zip, spreadsheets)
	- `mugshots/` — Extracted mugshot images
	- `baby/` — Extracted baby photos
	- `fonts/` — Uploaded font files
	- `masks/baby/` — Per-slot baby masks (for non-rectangular cropping)
	- `output.png` — Final generated spread

---

## Developer Workflow

### Backend
**Setup (one-time):**
```powershell
cd tool\server
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Start server (one-line):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd "C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\server"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**External PowerShell window:**
```powershell
Start-Process PowerShell -ArgumentList '-NoExit','-Command','Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd ''C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\server''; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'
```

### Frontend
**Setup (one-time):**
```powershell
cd tool\web
npm install
```

**Start dev server (one-line):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd "C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\web"; npm run dev
```

**External PowerShell window:**
```powershell
Start-Process PowerShell -ArgumentList '-NoExit','-Command','Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; cd ''C:\Users\bryanrdp\Documents\VS Code\Personal Projects\Yearbook Grad Mugshot Automator\tool\web''; npm run dev'
```

Vite binds to `0.0.0.0` (accessible via Tailscale) and proxies `/api` to backend.

**Build for production:**
```powershell
cd tool\web
npm run build
```

### Website (Astro, deploys to Cloudflare Workers)
```sh
cd website
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs website/dist
npm run cf:dev   # build, then serve through the actual Workers runtime locally (:8788)
npm run deploy   # build, then `wrangler deploy` (run `npx wrangler login` once first)
```
See [website/README.md](website/README.md) for the full Cloudflare Workers deployment notes, including the build-time-vs-runtime env var caveat for `PUBLIC_TOOL_URL`.

### Testing
- `cd tool/server && pytest` — Tests cover template parsing, progress tracking, and edge cases. See `tool/server/tests/` for examples.

---

## Troubleshooting & Gotchas

- **Template Parsing Fails**: Ensure your annotated template has clearly coloured rectangles for mugshot (green), baby (blue), name (orange), and quote (red). Name and quote boxes are required. Minimum area is 400px².
- **Spreadsheet Ingest Fails**: Spreadsheet must have "first name" and "last name" headers. Mugshot ZIP filenames must be numeric and match spreadsheet row index + 1.
- **Generation Fails**: You must parse a template first (so `template_clean.png` exists) and have at least one slot/person mapped.
- **Fonts**: If a font is missing, the backend falls back to system or default fonts. Upload TTF/OTF files if you need a specific font.
- **Long-Running Tasks**: Generation runs in a background thread; check `/api/generation/status` for progress.

---

## Codebase Reference

- **Backend Entrypoint**: `tool/server/app/main.py`
- **API Routers**: `tool/server/app/routes/`
- **Core Services**: `tool/server/app/services/`
- **Models/Schemas**: `tool/server/app/models/schemas.py`
- **Frontend Entrypoint**: `tool/web/src/App.tsx`
- **API Types/Helpers**: `tool/web/src/api.ts`

---

## License

Free for personal, non-commercial use. Commercial use requires a paid license.
See `LICENSE` for full terms.
