#!/usr/bin/env bash
#
# vps-run-backup-job.sh — Cron-safe backup runner with retry, logging, alerts.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-automation-lib.sh
source "${SCRIPT_DIR}/lib/backup-automation-lib.sh"

backup_automation_defaults
backup_automation_load_env
backup_automation_defaults
backup_automation_ensure_dirs

JOB=""
SCRIPT=""
RETRIES=""
BACKOFF=""

usage() {
  cat <<'EOF'
Usage: vps-run-backup-job.sh --job <name> --script <path> [--retries N] [--backoff SEC]

Exit codes:
  0  success
  1  failed after retries
  2  configuration error (script missing)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job) JOB="${2:-}"; shift 2 ;;
    --script) SCRIPT="${2:-}"; shift 2 ;;
    --retries) RETRIES="${2:-}"; shift 2 ;;
    --backoff) BACKOFF="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "${JOB}" && -n "${SCRIPT}" ]] || { usage; exit 2; }

[[ "${SCRIPT}" != /* ]] && SCRIPT="${SCRIPT_DIR}/${SCRIPT}"

RETRIES="${RETRIES:-${BACKUP_AUTOMATION_DEFAULT_RETRIES}}"
BACKOFF="${BACKOFF:-${BACKUP_AUTOMATION_DEFAULT_BACKOFF_SEC}}"

backup_automation_run_with_retry "${JOB}" "${SCRIPT}" "${RETRIES}" "${BACKOFF}"
