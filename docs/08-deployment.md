# Deployment

This describes how the live production instance is actually hosted. See [`01-architecture.md`](01-architecture.md#production-topology) for the request-flow diagram; this page is the operational how-to.

## The tool (`tool/server` + `tool/web`)

Hosted on a single machine, exposed publicly at **`https://yearbooktool.sighton.ca`** through a **Cloudflare Tunnel** (`cloudflared`, running as a systemd service with remotely-managed ingress config). The tunnel's origin service must be `http://localhost:5173` — **not `https://`** — since the frontend itself only serves plain HTTP.

Backend and frontend each run as a systemd service, unit files tracked in the repo at `deploy/systemd/` and installed to `/etc/systemd/system/`:

| Unit | Runs | Bind |
|---|---|---|
| `ymga-backend.service` | `uvicorn app.main:app` (no `--reload`) | `127.0.0.1:8000` |
| `ymga-frontend.service` | `npm run preview` (serves the last production build in `tool/web/dist/`) | `0.0.0.0:5173` |

The backend's loopback-only bind is deliberate: it's unreachable directly (even over LAN/Tailscale, even with `:8000` open) by design, regardless of firewall configuration. Only the frontend is bound to all interfaces, and its Vite config (`tool/web/vite.config.ts`, both `server.proxy` and `preview.proxy`) proxies `/api/*` to the loopback-bound backend server-side — so **any** remote access path (LAN, Tailscale, or the Cloudflare Tunnel) has to go through the frontend's port, never the backend's port directly.

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

Restarting the backend interrupts any in-progress generation jobs and, unless `YMGA_CLEAR_WORKSPACES_ON_STARTUP` has been explicitly set to a falsy value in this service's environment, **wipes every active workspace** on the way back up (see [`01-architecture.md`](01-architecture.md#startup--shutdown-lifespan)) — anyone with an in-progress session loses their uploaded template/roster/photos and has to start over. Time restarts accordingly, and be aware a local dev backend pointed at the same data directory has the identical effect (see the warning in [`07-development.md`](07-development.md#prerequisites)).

## The website

`yearbook.sighton.ca` auto-builds and deploys to Cloudflare Workers on every new commit via dashboard-side Git integration — **no local action or manual deploy step needed** for it, unlike the tool. `npm run deploy` (local `wrangler deploy`) is only for manual/out-of-band deploys, e.g. testing a `PUBLIC_TOOL_URL` change before it lands in the tracked `.env`.

## Operational checklist when changing `tool/server` or `tool/web`

1. Make the change, verify locally (dev server, `npm run build`/`lint`, `pytest` as applicable).
2. Decide whether it needs to reach production now, and coordinate the restart timing — a backend restart is disruptive to anyone with an active session (see above).
3. Rebuild (frontend only) and restart the relevant systemd service(s).
4. The website needs no equivalent step unless you changed `website/` itself, in which case a normal commit + push is sufficient.
