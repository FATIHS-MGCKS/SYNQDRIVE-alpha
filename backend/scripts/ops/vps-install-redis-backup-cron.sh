#!/usr/bin/env bash
#
# vps-install-redis-backup-cron.sh — Daily Redis RDB backup cron.
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-redis-backup"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKUP_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-backup-redis.sh"
LOG_FILE="/var/log/synqdrive-redis-backup.log"
CRON_SCHEDULE="${REDIS_BACKUP_CRON_SCHEDULE:-0 4 * * *}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root" >&2
  exit 1
fi

[[ -f "${BACKUP_SCRIPT}" ]] || { echo "ERROR: ${BACKUP_SCRIPT} not found" >&2; exit 1; }

chmod +x "${BACKUP_SCRIPT}" "${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-restore-test-redis.sh" 2>/dev/null || true
touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
# SynqDrive Redis RDB backup (Phase 2C.4) — BullMQ buffer only
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CRON_SCHEDULE} root ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "${CRON_FILE}"
systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true

echo "Installed: ${CRON_FILE} (${CRON_SCHEDULE} UTC)"
echo "Log: ${LOG_FILE}"
echo "Run persistence setup first: vps-configure-redis-persistence.sh"
