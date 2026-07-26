#!/usr/bin/env bash
#
# vps-install-backup-automation-cron.sh — Unified backup scheduler (Phase 2C.7).
# Replaces fragmented per-tier cron files with one orchestrated schedule.
#
set -euo pipefail

CRON_FILE="/etc/cron.d/synqdrive-backup-automation"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
OPS="${SYNQDRIVE_ROOT}/backend/scripts/ops"
RUNNER="${OPS}/vps-run-backup-job.sh"
HEALTH="${OPS}/vps-backup-automation-health.sh"
ENV_FILE="/opt/synqdrive/shared/backup-automation.env"
LOG_DIR="/var/log/synqdrive-backup"

# UTC schedule (after 2C.2–2C.5 design)
PG_SCHEDULE="${BACKUP_PG_CRON_SCHEDULE:-0 2 * * *}"
CH_SCHEDULE="${BACKUP_CH_CRON_SCHEDULE:-30 3 * * *}"
REDIS_SCHEDULE="${BACKUP_REDIS_CRON_SCHEDULE:-0 4 * * *}"
ENV_SCHEDULE="${BACKUP_ENV_CRON_SCHEDULE:-15 5 * * *}"
OFFSITE_SCHEDULE="${BACKUP_OFFSITE_CRON_SCHEDULE:-15 5 * * *}"
OFFSITE_VERIFY_SCHEDULE="${BACKUP_OFFSITE_VERIFY_CRON_SCHEDULE:-30 6 * * 0}"
HEALTH_SCHEDULE="${BACKUP_HEALTH_CRON_SCHEDULE:-45 6 * * *}"

[[ "$(id -u)" -eq 0 ]] || { echo "run as root"; exit 1; }
[[ -f "${RUNNER}" ]] || { echo "missing ${RUNNER}"; exit 1; }

chmod +x "${RUNNER}" "${HEALTH}" "${OPS}"/vps-backup-*.sh "${OPS}"/vps-sync-offsite-backups.sh \
  "${OPS}"/vps-verify-offsite-backups.sh 2>/dev/null || true
mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}" 2>/dev/null || true

ENV_PREFIX="set -a; [ -f ${ENV_FILE} ] && . ${ENV_FILE}; [ -f /opt/synqdrive/shared/offsite-backup.env ] && . /opt/synqdrive/shared/offsite-backup.env; [ -f /opt/synqdrive/shared/redis-backup.env ] && . /opt/synqdrive/shared/redis-backup.env; set +a;"

cat > "${CRON_FILE}" <<EOF
# SynqDrive unified backup automation (Phase 2C.7)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
MAILTO=""

${PG_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job postgresql --script ${OPS}/vps-backup-database.sh
${CH_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job clickhouse --script ${OPS}/vps-backup-clickhouse.sh
${REDIS_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job redis --script ${OPS}/vps-backup-redis.sh
${ENV_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job env-snapshot --script ${OPS}/vps-backup-env-snapshot.sh
${OFFSITE_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job offsite-sync --script ${OPS}/vps-sync-offsite-backups.sh
${OFFSITE_VERIFY_SCHEDULE} root ${ENV_PREFIX} ${RUNNER} --job offsite-verify --script ${OPS}/vps-verify-offsite-backups.sh --retries 1
${HEALTH_SCHEDULE} root ${ENV_PREFIX} ${HEALTH}
EOF

chmod 644 "${CRON_FILE}"
systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true

echo "Installed ${CRON_FILE}"
echo "  PostgreSQL:     ${PG_SCHEDULE} UTC"
echo "  ClickHouse:     ${CH_SCHEDULE} UTC"
echo "  Redis:          ${REDIS_SCHEDULE} UTC"
echo "  Env + Offsite:  ${ENV_SCHEDULE} UTC"
echo "  Offsite verify: ${OFFSITE_VERIFY_SCHEDULE} UTC"
echo "  Health check:   ${HEALTH_SCHEDULE} UTC"
echo ""
echo "Legacy cron files (optional remove after verification):"
echo "  /etc/cron.d/synqdrive-redis-backup"
echo "  /etc/cron.d/synqdrive-offsite-backup"
