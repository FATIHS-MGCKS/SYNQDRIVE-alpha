#!/usr/bin/env bash
# Install quarterly restore-validation cron on VPS (non-destructive drills only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATION_SCRIPT="${SCRIPT_DIR}/vps-restore-validation.sh"
ENV_FILE="${RESTORE_VALIDATION_ENV_FILE:-/opt/synqdrive/shared/restore-validation.env}"
CRON_SCHEDULE="${RESTORE_VALIDATION_CRON_SCHEDULE:-0 7 1 */3 *}"
LOG_DIR="/opt/synqdrive/shared/backups/restore-validation/logs"

[[ -f "${VALIDATION_SCRIPT}" ]] || { echo "missing ${VALIDATION_SCRIPT}" >&2; exit 1; }
chmod +x "${VALIDATION_SCRIPT}" "${SCRIPT_DIR}"/vps-restore-test-*.sh
mkdir -p "${LOG_DIR}"

CRON_LINE="${CRON_SCHEDULE} set -a; [ -f ${ENV_FILE} ] && . ${ENV_FILE}; set +a; ${VALIDATION_SCRIPT} >> ${LOG_DIR}/restore-validation.log 2>&1"

if crontab -l 2>/dev/null | grep -Fq "${VALIDATION_SCRIPT}"; then
  echo "cron already installed"
else
  (crontab -l 2>/dev/null; echo "${CRON_LINE}") | crontab -
  echo "installed: ${CRON_SCHEDULE}"
fi
