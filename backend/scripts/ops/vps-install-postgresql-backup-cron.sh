#!/usr/bin/env bash
#
# vps-install-postgresql-backup-cron.sh — Daily PostgreSQL backup cron (VPS).
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-postgresql-backup"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKUP_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-backup-postgresql.sh"
LOG_FILE="/var/log/synqdrive-postgresql-backup.log"
CRON_SCHEDULE="${PG_BACKUP_CRON_SCHEDULE:-0 2 * * *}"
GPG_HOME="${GPG_BACKUP_HOME:-/opt/synqdrive/shared/gpg-backup}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_SCRIPT}" ]]; then
  echo "ERROR: backup script not found: ${BACKUP_SCRIPT}" >&2
  exit 1
fi

chmod +x "${BACKUP_SCRIPT}" 2>/dev/null || true
touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
# SynqDrive PostgreSQL daily logical backup (Phase 2C.2)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
GNUPGHOME=${GPG_HOME}
${CRON_SCHEDULE} root ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "${CRON_FILE}"

if command -v systemctl >/dev/null 2>&1; then
  systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true
fi

echo "Installed cron: ${CRON_FILE}"
echo "Schedule: ${CRON_SCHEDULE} (UTC)"
echo "Log: ${LOG_FILE}"
echo "Config: /opt/synqdrive/shared/postgresql-backup.env"
