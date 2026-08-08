# Deployment

This describes how the live production instance is actually hosted. See [`01-architecture.md`](01-architecture.md#production-topology) for the request-flow diagram; this page is the operational how-to.

For the complete security checklist—including Cloudflare token rotation, post-restart verification, troubleshooting, and recurring maintenance—use the [`Production Security Runbook`](10-production-security-runbook.md).

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

The recommended installer below creates `/etc/ymga/ymga-backend.env` with independent random secrets and mode `0600`. For a manual installation, copy `deploy/systemd/ymga-backend.env.example` there, replace every placeholder, and set ownership to `root:root`. The unit also applies CPU, memory, task, file-descriptor, scheduling, and filesystem limits to protect other workloads on the host.

For the initial hardened deployment, or after either tracked unit changes, run this from the repository root after building the frontend:

```sh
sudo bash deploy/install-hardened-services.sh
```

The installer generates the root-only environment file only when it is absent, installs both tracked units, and restarts both services. It preserves existing secrets and does not rotate the Cloudflare Tunnel token or migrate workspace data.

## The website

`yearbook.sighton.ca` auto-builds and deploys to Cloudflare Workers on every new commit via dashboard-side Git integration — **no local action or manual deploy step needed** for it, unlike the tool. `npm run deploy` (local `wrangler deploy`) is only for manual/out-of-band deploys, e.g. testing a `PUBLIC_TOOL_URL` change before updating the Cloudflare build environment. Populated `.env` files remain local and ignored.

## Operational checklist when changing `tool/server` or `tool/web`

1. Make the change, verify locally (dev server, `npm run build`/`lint`, `pytest` as applicable).
2. Decide whether it needs to reach production now, and coordinate the restart timing — a backend restart is disruptive to anyone with an active session (see above).
3. Rebuild (frontend only) and restart the relevant systemd service(s).
4. The website needs no equivalent step unless you changed `website/` itself, in which case a normal commit + push is sufficient.
