# Production Security Runbook

This is the practical checklist for operating the hosted tool. The production tool is not installed on a student's computer: browsers send data over HTTPS to `yearbooktool.sighton.ca`, and processing occurs on the Canadian server.

## Security Baseline Added August 2026

- FastAPI and Vite bind only to `127.0.0.1`; Cloudflare Tunnel is the only intended remote entry point.
- License authorization uses secure, HTTP-only cookies instead of license keys in URLs. Host, origin, request-size, concurrency, and security-header checks are enforced server-side.
- Workspace ownership and paths are validated. Uploads, archives, images, spreadsheets, generated output, and total workspace storage have bounded sizes.
- Generation and background jobs have concurrency limits, and application settings bound network throughput. systemd caps CPU, memory, tasks, open files, and scheduling priority to protect other programs on the server.
- Runtime workspaces, license records, audit records, secret files, and `.env` files are ignored by Git. Removing them from the current Git index does not remove copies from older commits.

## Apply or Reapply the Hardened Services

Build and test from the repository root before restarting production:

```sh
cd tool/server
.venv/bin/python -m pytest
cd ../web
npm ci
npm run test:server
npm run lint
npm run build
cd ../..
sudo bash deploy/install-hardened-services.sh
```

The installer creates `/etc/ymga/ymga-backend.env` as `root:root` mode `0600` with independent random admin, license-signing, and session secrets if the file does not exist. On later runs it preserves that file. It then installs the backend and frontend units, reloads systemd, and restarts both services. Before reporting success, it waits for health, checks the frontend-to-backend proxy, confirms an unknown hostname is rejected, and verifies both listeners are loopback-only. A backend restart interrupts active generation jobs.

The installer does **not** build the frontend, deploy the marketing website, rotate the Cloudflare token, rewrite Git history, or migrate workspace data.

Retrieve the generated admin password only when needed:

```sh
sudo grep '^YMGA_LICENSE_ADMIN_PASSWORD=' /etc/ymga/ymga-backend.env
```

Do not paste that output into chat, email, an issue, or a shell command.

## Verify Production After a Restart

```sh
sudo systemctl is-active ymga-backend.service ymga-frontend.service cloudflared.service
sudo systemctl --no-pager --full status ymga-backend.service ymga-frontend.service
sudo ss -ltnp | rg '127\.0\.0\.1:(5173|8000)'
curl -fsS http://127.0.0.1:8000/health
curl -I http://127.0.0.1:5173
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: attacker.example' http://127.0.0.1:5173
curl -I https://yearbooktool.sighton.ca
```

Both application services should be `active`, and the backend health request should return `{"status":"ok"}`. Ports `5173` and `8000` must appear only on `127.0.0.1`, never `0.0.0.0` or a LAN address. The unapproved-host request must return `421`. The public request should use HTTPS and may redirect to Cloudflare Access.

If a service fails, inspect the newest entries first:

```sh
sudo journalctl -u ymga-backend.service -n 100 --no-pager
sudo journalctl -u ymga-frontend.service -n 100 --no-pager
sudo journalctl -u cloudflared.service -n 100 --no-pager
```

Two startup failures fixed during the August 2026 rollout are worth recognizing:

- `226/NAMESPACE` with a path containing literal `x20` means an old backend unit encoded spaces incorrectly. Reinstall the current tracked units with the installer.
- `EROFS ... vite.config.ts.timestamp-....mjs` means an old frontend unit tried to run Vite preview inside the read-only repository. The current unit runs `tool/web/production-server.js`; reinstall it with the installer. Vite preview is reserved for local build checks, not production hosting.

## Rotate the Cloudflare Tunnel Token

Do this once after the August 2026 hardening and after any suspected disclosure:

1. In the Cloudflare dashboard, rotate the tunnel token so the old token stops working.
2. Store the replacement without putting it in command history:

```sh
sudo install -d -o root -g root -m 700 /etc/cloudflared
read -rsp "New tunnel token: " YMGA_CF_TOKEN; echo
printf '%s' "$YMGA_CF_TOKEN" | sudo tee /etc/cloudflared/ymga-tunnel-token >/dev/null
unset YMGA_CF_TOKEN
sudo chown root:root /etc/cloudflared/ymga-tunnel-token
sudo chmod 600 /etc/cloudflared/ymga-tunnel-token
sudo install -o root -g root -m 644 deploy/systemd/cloudflared-example.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl restart cloudflared.service
```

3. Verify the public endpoint, then confirm the old token is revoked in Cloudflare.

## Release and Maintenance Routine

For each release: review `git diff`, run the tests/lint/build above, push the commit, rebuild `tool/web`, restart only the affected services, and verify the public endpoint. Website changes deploy through the configured Cloudflare Git integration after a push; tool services do not auto-update.

Monthly: install OS and dependency security updates, review service failures and resource use, check workspace retention/deletion, and confirm backups are encrypted and restorable. Never commit student data or populated secrets. If a credential may have leaked, rotate it first; coordinate any Git-history rewrite separately.

## Accepted Deferred Risk

Workspace data currently remains on the existing unencrypted NTFS volume. The application still protects it in transit and restricts access at the service/API layers, but this does not protect data if the physical drive or host is compromised. No data migration occurs until `YMGA_WORKSPACE_DATA_DIR` is deliberately moved to an encrypted Linux filesystem.
