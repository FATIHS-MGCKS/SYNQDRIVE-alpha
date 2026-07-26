#!/usr/bin/env bash
#
# vps-install-clickhouse-backup-cron.sh — Daily ClickHouse backup cron (VPS).
#
# Idempotent: writes /etc/cron.d/synqdrive-clickhouse-backup
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-clickhouse-backup"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKUP_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-backup-clickhouse.sh"
LOG_FILE="/var/log/synqdrive-clickhouse-backup.log"
CRON_SCHEDULE="${CH_BACKUP_CRON_SCHEDULE:-30 3 * * *}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_SCRIPT}" ]]; then
  echo "ERROR: backup script not found: ${BACKUP_SCRIPT}" >&2
  exit 1
fi

chmod +x "${BACKUP_SCRIPT}" "${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-restore-test-clickhouse.sh" 2>/dev/null || true

touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
# SynqDrive ClickHouse daily logical backup (Phase 2C.3)
# No container/mount/volume changes — uses existing Disk('backups').
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CRON_SCHEDULE} root ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "${CRON_FILE}"

if command -v systemctl >/dev/null 2>&1; then
  systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true
fi

echo "Installed cron: ${CRON_FILE}"
echo "Schedule: ${CRON_SCHEDULE} (UTC) — after PostgreSQL backup window"
echo "Log: ${LOG_FILE}"
echo "Config: /opt/synqdrive/shared/clickhouse-backup.env"
