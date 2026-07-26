#!/usr/bin/env bash
#
# vps-install-offsite-backup-cron.sh — Daily offsite sync + env snapshot cron.
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-offsite-backup"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
ENV_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-backup-env-snapshot.sh"
SYNC_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-sync-offsite-backups.sh"
VERIFY_SCRIPT="${SYNQDRIVE_ROOT}/backend/scripts/ops/vps-verify-offsite-backups.sh"
LOG_FILE="/var/log/synqdrive-offsite-backup.log"
# After PG (02:00), CH (03:30), Redis (04:00)
CRON_SCHEDULE="${OFFSITE_CRON_SCHEDULE:-15 5 * * *}"
VERIFY_SCHEDULE="${OFFSITE_VERIFY_CRON_SCHEDULE:-30 6 * * 0}"

[[ "$(id -u)" -eq 0 ]] || { echo "run as root"; exit 1; }

touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
# SynqDrive offsite backup sync (Phase 2C.5)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CRON_SCHEDULE} root ${ENV_SCRIPT} && ${SYNC_SCRIPT} >> ${LOG_FILE} 2>&1
${VERIFY_SCHEDULE} root ${VERIFY_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "${CRON_FILE}"
systemctl reload cron 2>/dev/null || true

echo "Installed ${CRON_FILE}"
echo "Daily: env snapshot + offsite sync (${CRON_SCHEDULE} UTC)"
echo "Weekly verify: ${VERIFY_SCHEDULE} UTC"
echo "NOTE: Prefer unified scheduler: vps-install-backup-automation-cron.sh (Phase 2C.7)"
