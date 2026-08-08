# Security and Production Checklist

## Reporting

Report suspected vulnerabilities or student-data exposure privately to `sightonmedia@gmail.com`. Do not include student files in the first message.

## Required Production Controls

- Expose only `https://yearbooktool.sighton.ca` through Cloudflare Tunnel. Keep both `127.0.0.1:5173` and `127.0.0.1:8000` closed to LAN and public ingress.
- Set Cloudflare SSL/TLS to a secure mode, enable **Always Use HTTPS**, keep Universal SSL enabled, enable appropriate WAF/rate-limit rules, and protect `/admin*` with Cloudflare Access where possible.
- Rotate the existing Tunnel token in Cloudflare, store the replacement only in `/etc/cloudflared/ymga-tunnel-token` as `root:root` mode `0600`, and install `deploy/systemd/cloudflared-example.service`. Do not put a token directly in `ExecStart`.
- Copy `deploy/systemd/ymga-backend.env.example` to `/etc/ymga/ymga-backend.env`, replace every placeholder with an independent cryptographically random value, set `root:root` ownership, and apply mode `0600`.
- Install the tracked systemd units and review their CPU, memory, task, file-descriptor, scheduling, and filesystem limits against the host's capacity.
- Apply the reviewed units and generate root-only secrets with `sudo bash deploy/install-hardened-services.sh`; the installer preserves an existing `/etc/ymga/ymga-backend.env`.
- Store `YMGA_WORKSPACE_DATA_DIR` on an encrypted Linux filesystem with permissions enforced by the operating system. The current NTFS mount reports mode `0777` and does not provide an adequate at-rest boundary. Migrate and verify data before changing this variable.
- Keep production workspace startup clearing disabled. Confirm expired-workspace cleanup remains enabled and set commercial retention deliberately; disabled expiry retains student data until manual deletion.

## Operational Practice

- Rotate all license/admin/session secrets after any suspected disclosure. Runtime license and workspace files must remain ignored by Git; previously committed secrets also require Git-history cleanup where feasible.
- Patch the OS, Python, Node, Cloudflare Tunnel, and application dependencies routinely. Run dependency audits before each release.
- Use encrypted backups only, restrict restore access, test deletion/restore procedures, and document retention.
- Review audit logs and resource dashboards, but never log request bodies, student names, images, license keys, or URL query strings.
- Rebuild, test, and stage changes before restarting production. A backend restart interrupts active generation jobs.

These controls reduce risk; they do not make an internet service risk-free. Schools remain responsible for authorization, consent, and applicable student-record/privacy obligations.
