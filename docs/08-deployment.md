# Deployment

This describes how the live production instance is actually hosted. See [`01-architecture.md`](01-architecture.md#production-topology) for the request-flow diagram; this page is the operational how-to.

## The tool (`tool/server` + `tool/web`)

Hosted on a single machine, exposed publicly at **`https://yearbooktool.sighton.ca`** through a **Cloudflare Tunnel** (`cloudflared`, running as a systemd service with remotely-managed ingress config). The tunnel's origin service must be `http://localhost:5173` — **not `https://`** — since the frontend itself only serves plain HTTP.

Backend and frontend each run as a systemd service, unit files tracked in the repo at `deploy/systemd/` and installed to `/etc/systemd/system/`:

| Unit | Runs | Bind |
|---|---|---|
| `ymga-backend.service` | `uvicorn app.main:app` (no `--reload`) | `127.0.0.1:8000` |
| `ymga-frontend.service` | `npm run preview` (serves the last production build in `tool/web/dist/`) | `127.0.0.1:5173` |

Both services bind to loopback so student uploads cannot bypass HTTPS over a LAN/Tailscale port. The Vite frontend proxies `/api/*` to FastAPI, and the Cloudflare Tunnel is the only intended remote ingress path.

### Updating the live instance

**Neither service auto-updates on code changes.** Deploying a change means:

```sh
# Backend (Python changes)
sudo systemctl restart ymga-backend.service

# Frontend (tool/web changes)
cd tool/web
npm run build
sudo systemctl restart ymga-frontend.service
```

Restarting the backend interrupts in-progress generation jobs. The production unit sets `YMGA_CLEAR_WORKSPACES_ON_STARTUP=false`; retain that setting so restarts do not wipe active workspaces. A separate development backend must never share the production data directory.

Before installing the backend unit, copy `deploy/systemd/ymga-backend.env.example` to `/etc/ymga/ymga-backend.env`, replace every placeholder with an independent random secret, set ownership to `root:root`, and run `chmod 600` on the file. The unit also applies CPU, memory, task, file-descriptor, scheduling, and filesystem limits to protect other workloads on the host.

## The website

`yearbook.sighton.ca` auto-builds and deploys to Cloudflare Workers on every new commit via dashboard-side Git integration — **no local action or manual deploy step needed** for it, unlike the tool. `npm run deploy` (local `wrangler deploy`) is only for manual/out-of-band deploys, e.g. testing a `PUBLIC_TOOL_URL` change before it lands in the tracked `.env`.

## Operational checklist when changing `tool/server` or `tool/web`

1. Make the change, verify locally (dev server, `npm run build`/`lint`, `pytest` as applicable).
2. Decide whether it needs to reach production now, and coordinate the restart timing — a backend restart is disruptive to anyone with an active session (see above).
3. Rebuild (frontend only) and restart the relevant systemd service(s).
4. The website needs no equivalent step unless you changed `website/` itself, in which case a normal commit + push is sufficient.
