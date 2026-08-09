#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer as root: sudo bash deploy/install-hardened-services.sh" >&2
  exit 1
fi

ymga_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ymga_repo_root="$(cd -- "${ymga_script_dir}/.." && pwd)"
ymga_env_dir="/etc/ymga"
ymga_env_file="${ymga_env_dir}/ymga-backend.env"

command -v openssl >/dev/null
command -v curl >/dev/null
command -v ss >/dev/null
install -d -o root -g root -m 700 "${ymga_env_dir}"

if [[ ! -e ${ymga_env_file} ]]; then
  ymga_admin_secret="$(openssl rand -hex 24)"
  ymga_license_secret="$(openssl rand -hex 48)"
  ymga_session_secret="$(openssl rand -hex 48)"

  install -o root -g root -m 600 \
    "${ymga_repo_root}/deploy/systemd/ymga-backend.env.example" \
    "${ymga_env_file}"
  sed -i \
    -e "s|replace-with-at-least-14-random-characters|${ymga_admin_secret}|" \
    -e "s|replace-with-a-long-random-hmac-secret|${ymga_license_secret}|" \
    -e "s|replace-with-a-different-long-random-secret|${ymga_session_secret}|" \
    "${ymga_env_file}"
  unset ymga_admin_secret ymga_license_secret ymga_session_secret
  echo "Generated new root-only application secrets in ${ymga_env_file}."
else
  echo "Preserving existing ${ymga_env_file}."
fi

install -o root -g root -m 644 \
  "${ymga_repo_root}/deploy/systemd/ymga-backend.service" \
  /etc/systemd/system/ymga-backend.service
install -o root -g root -m 644 \
  "${ymga_repo_root}/deploy/systemd/ymga-frontend.service" \
  /etc/systemd/system/ymga-frontend.service

systemctl daemon-reload
systemctl reset-failed ymga-backend.service ymga-frontend.service
systemctl restart ymga-backend.service ymga-frontend.service

ymga_services_ready=false
for ymga_attempt in {1..30}; do
  if systemctl is-active --quiet ymga-backend.service \
    && systemctl is-active --quiet ymga-frontend.service \
    && curl -fs --max-time 3 http://127.0.0.1:8000/health >/dev/null \
    && curl -fs --max-time 3 -H "Host: yearbooktool.sighton.ca" http://127.0.0.1:5173/ >/dev/null; then
    ymga_services_ready=true
    break
  fi
  sleep 1
done

if [[ ${ymga_services_ready} != true ]]; then
  echo "Service health validation failed." >&2
  systemctl --no-pager --full status ymga-backend.service ymga-frontend.service || true
  journalctl -u ymga-backend.service -u ymga-frontend.service -n 80 --no-pager || true
  exit 1
fi

ymga_bad_host_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
  -H "Host: validation.invalid" http://127.0.0.1:5173/ || true)"
if [[ ${ymga_bad_host_status} != 421 ]]; then
  echo "Frontend host-header validation failed (expected 421, got ${ymga_bad_host_status:-no response})." >&2
  exit 1
fi

ymga_proxy_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
  -H "Host: yearbooktool.sighton.ca" http://127.0.0.1:5173/api/licensing/validate || true)"
if [[ ${ymga_proxy_status} != 405 ]]; then
  echo "Frontend-to-backend proxy validation failed (expected 405, got ${ymga_proxy_status:-no response})." >&2
  exit 1
fi

ymga_frontend_listener="$(ss -H -ltn 'sport = :5173')"
ymga_backend_listener="$(ss -H -ltn 'sport = :8000')"
if [[ ${ymga_frontend_listener} != *"127.0.0.1:5173"* \
  || ${ymga_frontend_listener} == *"0.0.0.0:5173"* \
  || ${ymga_backend_listener} != *"127.0.0.1:8000"* \
  || ${ymga_backend_listener} == *"0.0.0.0:8000"* ]]; then
  echo "Loopback listener validation failed." >&2
  printf '%s\n%s\n' "${ymga_frontend_listener}" "${ymga_backend_listener}" >&2
  exit 1
fi

systemctl --no-pager --full status ymga-backend.service ymga-frontend.service

echo
echo "Hardened services installed and local health, proxy, host, and listener checks passed."
echo "Retrieve/reset the generated admin password through the root-only env file."
echo "This installer does not migrate workspace data or rotate the Cloudflare Tunnel token."
