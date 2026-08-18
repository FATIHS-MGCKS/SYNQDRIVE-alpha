#!/usr/bin/env bash
#
# vps-setup-offsite-backup.sh — Install rclone and configure offsite backup on VPS.
#
# Reads /opt/synqdrive/shared/offsite-backup.env (copy from offsite-backup.env.example).
# For S3-compatible storage, set OFFSITE_MODE=s3 or configure rclone remote via:
#   /opt/synqdrive/shared/secrets/rclone.conf (chmod 600)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="/opt/synqdrive/shared/offsite-backup.env"
ENV_EXAMPLE="${SCRIPT_DIR}/offsite-backup.env.example"
RCLONE_CONF="/opt/synqdrive/shared/secrets/rclone.conf"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq rclone
fi

if ! command -v aws >/dev/null 2>&1 && [[ -f "${ENV_FILE}" ]] && grep -q '^OFFSITE_MODE=s3' "${ENV_FILE}"; then
  apt-get install -y -qq awscli
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE} — configure OFFSITE_MODE and credentials before sync"
fi

mkdir -p /opt/synqdrive/shared/backups/offsite/state
mkdir -p /opt/synqdrive/shared/secrets
chmod 700 /opt/synqdrive/shared/secrets

# Optional: generate rclone.conf from S3 env vars (dedicated backup credentials only)
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
fi

if [[ "${OFFSITE_MODE:-none}" == "rclone" && -n "${OFFSITE_S3_ENDPOINT:-}" && -n "${OFFSITE_S3_ACCESS_KEY_ID:-}" && -n "${OFFSITE_S3_SECRET_ACCESS_KEY:-}" && ! -f "${RCLONE_CONF}" ]]; then
  cat > "${RCLONE_CONF}" <<EOF
[offsite]
type = s3
provider = Other
env_auth = false
access_key_id = ${OFFSITE_S3_ACCESS_KEY_ID}
secret_access_key = ${OFFSITE_S3_SECRET_ACCESS_KEY}
endpoint = ${OFFSITE_S3_ENDPOINT}
acl = private
no_check_bucket = true
EOF
  chmod 600 "${RCLONE_CONF}"
  if ! grep -q '^OFFSITE_RCLONE_REMOTE=' "${ENV_FILE}"; then
    echo 'OFFSITE_RCLONE_REMOTE=offsite:synqdrive-backups/production' >> "${ENV_FILE}"
  fi
  echo "Wrote rclone config: ${RCLONE_CONF}"
fi

export RCLONE_CONFIG="${RCLONE_CONF}"
bash "${SCRIPT_DIR}/vps-install-offsite-backup-cron.sh"

echo "Offsite setup complete."
echo "  env: ${ENV_FILE}"
echo "  rclone: $(command -v rclone)"
echo "  dry-run: bash ${SCRIPT_DIR}/vps-sync-offsite-backups.sh --dry-run"
