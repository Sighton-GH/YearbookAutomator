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
systemctl restart ymga-backend.service ymga-frontend.service
systemctl --no-pager --full status ymga-backend.service ymga-frontend.service

echo
echo "Hardened services installed. Retrieve/reset the generated admin password through the root-only env file."
echo "This installer does not migrate workspace data or rotate the Cloudflare Tunnel token."
