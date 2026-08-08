# Development setup

## Prerequisites

- **Python 3.12** for the backend. **Avoid 3.13+** — dependency compatibility issues (`tool/server/requirements.txt` pins fairly specific versions: FastAPI 0.111, Pydantic 2.7, OpenCV 4.9, ONNX Runtime 1.20, etc.).
- **Node.js** for both `tool/web` (Vite 5) and `website` (Astro 6, `engines.node >= 22.12.0`).

> ⚠️ **This repository's production instance runs on the same machine as local development**, sharing the same backend data directory (`tool/server/app/data/`) unless you point a second instance at a different `YMGA_LICENSE_STORE_DIR`/data path. The backend **wipes all workspace data on startup by default** (`YMGA_CLEAR_WORKSPACES_ON_STARTUP`, default true — see [`01-architecture.md`](01-architecture.md#startup--shutdown-lifespan)). Starting a second backend instance against the same data directory as a running instance (e.g. the `ymga-backend.service` systemd unit — see [`08-deployment.md`](08-deployment.md)) will delete that instance's live workspace files the moment it starts. Check `sudo systemctl status ymga-backend.service` before spinning up a local dev backend if you're unsure whether a production instance is already running against the same checkout.

## Backend

```sh
cd tool/server
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Binds to loopback so development uploads are not exposed over unencrypted LAN/Tailscale ports. Always invoke `.venv/bin/python` explicitly rather than relying on an activated shell, so the `--reload` subprocess uses the right interpreter.

Windows: `py -3.12 -m venv .venv`, then `.venv\Scripts\python.exe -m pip install -r requirements.txt` and the equivalent `uvicorn` invocation.

## Frontend

```sh
cd tool/web
npm install
npm run dev       # :5173, proxies /api -> 127.0.0.1:8000
npm run build     # tsc && vite build
npm run lint       # eslint .
```

## Both together

```sh
bash start-dev.sh
```

Starts backend + frontend in one go. Set `YMGA_LICENSE_ADMIN_PASSWORD` to a unique value of at least 14 characters if you need the admin panel; admin access fails closed when no strong password is configured.

## Website

```sh
cd website
npm install
npm run dev       # :4321
npm run build     # -> website/dist
npm run cf:dev    # build, then serve through the real Workers runtime locally, :8788
npm run deploy    # build, then `wrangler deploy` (needs `npx wrangler login` once)
```

`PUBLIC_TOOL_URL` must be set in `.env` **before** `build`/`deploy` — see [`06-website.md`](06-website.md#build-time-vs-runtime-env-vars).

## Testing

**Backend** — the only automated suite in the repo:

```sh
cd tool/server
.venv/bin/python -m pytest                                            # all tests
.venv/bin/python -m pytest tests/test_template_parser.py              # one file
.venv/bin/python -m pytest tests/test_template_parser.py::test_name -v # one test
```

See [`03-backend.md`](03-backend.md#testing) for what each test file actually pins down. Backend tests monkeypatch `storage.BASE_DATA` to a tmp directory rather than touching real workspace data — follow that pattern in any new test rather than writing into the real `app/data/`. Template-parser tests build synthetic BGR images with OpenCV and feed them through `cv2.imencode` rather than using fixture image files — follow that pattern too if you add parser tests.

**Frontend / website** — no automated test suite for either. Verify `tool/web` changes by running its dev server and exercising the actual 5-step flow (golden path + edge cases) in a browser; verify `website` changes by running its dev server and checking the affected page. `npm run build`/`npm run lint` catch type/lint errors but not runtime behavior.

## Environment variables

### `tool/server` (backend)

Most runtime knobs are **admin-settings-overridable** (`/admin/settings`, persisted to `data/_settings/settings.json`) — the env var below only sets the *initial* default before anything has been explicitly saved through the admin UI. Grep `os.getenv` in `tool/server/app` before assuming a behavior is hardcoded; this list covers the ones worth knowing up front.

| Variable | Default | Purpose |
|---|---|---|
| `YMGA_CLEAR_WORKSPACES_ON_STARTUP` | `true` | Wipe all workspace dirs on every backend start (see warning above) |
| `YMGA_LICENSE_SECRET` | auto-generated, stored at `data/_licenses/secret.txt` | HMAC secret for license keys — pin this to keep keys stable across data-dir migrations |
| `YMGA_LICENSE_STORE_DIR` | `data/_licenses/` | Override the license/registry/audit/usage store location |
| `YMGA_LICENSE_ADMIN_USERNAME` | `admin` | Admin panel Basic-auth fallback username |
| `YMGA_LICENSE_ADMIN_PASSWORD` | unset | Admin panel Basic-auth fallback password — **set this** for any non-trivial deployment |
| `YMGA_ADMIN_SESSION_SECRET` | auto-generated | Signing secret for the admin session cookie |
| `YMGA_ADMIN_IDLE_TIMEOUT_SECONDS` | `900` | Admin session idle timeout |
| `YMGA_ADMIN_MAX_SESSION_SECONDS` | `28800` | Admin session absolute lifetime |
| `YMGA_PERSONAL_MONTHLY_LIMIT` | `5` | Free personal-license uses per month |
| `YMGA_NETWORK_UPLOAD_LIMIT_KBPS` / `..._DOWNLOAD_LIMIT_KBPS` | `25000` / `50000` | Network throttling, see [`03-backend.md`](03-backend.md#performance--resource-limits) |
| `YMGA_CPU_MAX_THREADS` | `0` (all cores) | OpenCV/ONNX Runtime thread cap |
| `YMGA_CPU_THROTTLE_PERCENT` | `100` | CPU duty-cycle pacing |
| `YMGA_CPU_LOW_PRIORITY` | `false` | Lower OS scheduling priority (POSIX: raising back may need a restart) |
| `YMGA_GPU_DISABLED` | `false` | Force CPU-only inference |
| `YMGA_GPU_THROTTLE_PERCENT` | `100` | GPU duty-cycle pacing |
| `YMGA_GPU_MAX_CONCURRENT_OPS` | `1` | Cap concurrent GPU-bound inference calls |
| `YMGA_REMBG_PROVIDER` | auto-detected | Force an ONNX execution provider for background removal (e.g. `CUDAExecutionProvider`, `DmlExecutionProvider`) |
| `YMGA_REMBG_POOL_SIZE` | `min(cpu_count, 3)` (non-Windows) | `rembg` session pool size |
| `YMGA_REMBG_VERBOSE` | `false` | Show `rembg`/pymatting's normally-suppressed perf-warning output |
| `YMGA_FACE_PROVIDER` | auto-detected | Force an ONNX execution provider for RetinaFace |
| `YMGA_YUNET_BACKEND` / `YMGA_YUNET_TARGET` | auto | OpenCV DNN backend/target selection for YuNet |
| `YMGA_RENDER_PREFER_GPU` | `true` | Gate CUDA-accelerated resize attempts during rendering |
| `YMGA_OPENCL` | `true` | Gate OpenCL-accelerated OpenCV ops (template parsing, background removal, rendering) |

Verify which ONNX providers are actually available at runtime with:

```sh
python -c "import onnxruntime; print(onnxruntime.get_available_providers())"
```

GPU acceleration notes: Linux installs `onnxruntime-gpu` automatically (needs a matching CUDA toolkit + cuDNN); Windows installs `onnxruntime-directml` by default (works on most DX12 feature-level-11_0+ GPUs) — swap for `onnxruntime-gpu` if you have a supported NVIDIA card and want CUDA instead. No GPU provider available → falls back to CPU automatically, no configuration needed.

### `tool/web` (frontend)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_WEBSITE_URL` | `https://yearbook.sighton.ca` | "Back to main website" link target; local dev default documented in `.env.example` is `http://localhost:4321` |

### `website`

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_TOOL_URL` | `https://yearbooktool.sighton.ca` | Every "Tool" link/CTA target — **build-time only**, see [`06-website.md`](06-website.md#build-time-vs-runtime-env-vars) |

Copy each `.env.example` to `.env` and adjust before building for a real deployment; local-dev defaults in the example files already match the three dev ports (`:8000`, `:5173`, `:4321`).
