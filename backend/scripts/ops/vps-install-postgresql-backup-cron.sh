#!/usr/bin/env bash
#
# vps-install-postgresql-backup-cron.sh — Install daily PostgreSQL backup cron on VPS.
#
# Idempotent: writes /etc/cron.d/synqdrive-postgresql-backup
#
# Usage (on VPS as root):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-install-postgresql-backup-cron.sh
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-postgresql-backup"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKUP_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-backup-database.sh"
LOG_FILE="/var/log/synqdrive-postgresql-backup.log"
CRON_SCHEDULE="${PG_BACKUP_CRON_SCHEDULE:-0 2 * * *}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

if [[ ! -x "${BACKUP_SCRIPT}" ]]; then
  chmod +x "${BACKUP_SCRIPT}" "${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-restore-test-database.sh" 2>/dev/null || true
fi

if [[ ! -f "${BACKUP_SCRIPT}" ]]; then
  echo "ERROR: backup script not found: ${BACKUP_SCRIPT}" >&2
  exit 1
fi

touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
# SynqDrive PostgreSQL daily backup (Phase 2C.2)
# Do not edit manually — re-run vps-install-postgresql-backup-cron.sh from repo.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
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
echo ""
echo "Next steps:"
echo "  1. Copy postgresql-backup.env.example → /opt/synqdrive/shared/postgresql-backup.env"
echo "  2. Configure GPG + offsite (rclone/s3)"
echo "  3. Run manual backup: ${BACKUP_SCRIPT}"
echo "  4. Run restore test: ${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-restore-test-database.sh"
