#!/usr/bin/env bash
#
# vps-restore-validation.sh — Full isolated restore validation (Phase 2C.6).
# Runs all tier restore drills; production data is never modified.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs
export RESTORE_VALIDATION_RUN_ID="${RV_RUN_ID}"
export RESTORE_VALIDATION_RESULTS_FILE="${RV_RESULTS_FILE}"

SKIP_PG=false
SKIP_CH=false
SKIP_REDIS=false
SKIP_ENV=false
SKIP_UPLOADS=false
SKIP_DOCUMENTS=false
PG_DRILL_DB=""

usage() {
  cat <<'EOF'
Usage: vps-restore-validation.sh [options]

Runs isolated restore drills for all backup tiers and writes a JSON report.

Options:
  --skip-postgresql
  --skip-clickhouse
  --skip-redis
  --skip-env
  --skip-uploads
  --skip-documents
  -h, --help

Environment:
  RESTORE_VALIDATION_MODE=isolated (required)
  RESTORE_VALIDATION_ALLOW_PRODUCTION=false (required)
  RESTORE_VALIDATION_PG_* / CH_* — isolated drill targets
  RESTORE_VALIDATION_GPG_PASSPHRASE_FILE — for encrypted artifacts
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-postgresql) SKIP_PG=true; shift ;;
    --skip-clickhouse) SKIP_CH=true; shift ;;
    --skip-redis) SKIP_REDIS=true; shift ;;
    --skip-env) SKIP_ENV=true; shift ;;
    --skip-uploads) SKIP_UPLOADS=true; shift ;;
    --skip-documents) SKIP_DOCUMENTS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) rv_die "unknown argument: $1" ;;
  esac
done

RUN_START="$(rv_now_ms)"
rv_log "restore-validation run_id=${RV_RUN_ID} mode=${RESTORE_VALIDATION_MODE}"

run_tier() {
  local name="$1"
  local script="$2"
  shift 2
  rv_log "=== tier: ${name} ==="
  if bash "${script}" "$@"; then
    rv_log "tier ${name}: completed"
  else
    local code=$?
    rv_log "tier ${name}: finished with exit ${code} (recorded in report)"
  fi
}

if [[ "${SKIP_PG}" != "true" ]]; then
  if bash "${SCRIPT_DIR}/vps-restore-test-postgresql.sh" --keep-db; then
    PG_DRILL_DB="synqdrive_restore_${RESTORE_VALIDATION_RUN_ID}"
  fi
fi

if [[ "${SKIP_CH}" != "true" ]]; then
  run_tier "clickhouse" "${SCRIPT_DIR}/vps-restore-test-clickhouse.sh"
fi

if [[ "${SKIP_REDIS}" != "true" ]]; then
  START_MS="$(rv_now_ms)"
  export REDIS_BACKUP_GPG_PASSPHRASE_FILE="${REDIS_BACKUP_GPG_PASSPHRASE_FILE:-${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE:-}}"
  if bash "${SCRIPT_DIR}/vps-restore-test-redis.sh"; then
    rv_record_tier_result "redis" true "$(rv_elapsed_ms "${START_MS}")" "passed" "" "redis-check-rdb integrity drill; live Redis untouched"
  else
    REDIS_DIR="${RESTORE_VALIDATION_REDIS_BACKUP_DIR:-/opt/synqdrive/shared/backups/redis/daily}"
    if [[ ! -d "${REDIS_DIR}" ]] || [[ -z "$(ls -A "${REDIS_DIR}" 2>/dev/null || true)" ]]; then
      rv_record_tier_result "redis" false "$(rv_elapsed_ms "${START_MS}")" "blocked" "no redis backup artifact" ""
    else
      rv_record_tier_result "redis" false "$(rv_elapsed_ms "${START_MS}")" "failed" "redis-check-rdb or decrypt failed" ""
    fi
  fi
fi

if [[ "${SKIP_ENV}" != "true" ]]; then
  run_tier "configuration" "${SCRIPT_DIR}/vps-restore-test-env.sh"
fi

if [[ "${SKIP_UPLOADS}" != "true" ]]; then
  run_tier "uploads" "${SCRIPT_DIR}/vps-restore-test-uploads.sh" || true
fi

if [[ "${SKIP_DOCUMENTS}" != "true" ]]; then
  DOC_ARGS=()
  [[ -n "${PG_DRILL_DB}" ]] && DOC_ARGS=(--pg-drill-db "${PG_DRILL_DB}")
  run_tier "documents" "${SCRIPT_DIR}/vps-restore-test-documents.sh" "${DOC_ARGS[@]}" || true
fi

if [[ -n "${PG_DRILL_DB}" ]]; then
  rv_pg_admin_psql -c "DROP DATABASE IF EXISTS \"${PG_DRILL_DB}\";" 2>/dev/null || true
fi

REPORT="$(rv_write_report 2>/dev/null | tail -1)"
TOTAL_MS="$(rv_elapsed_ms "${RUN_START}")"
rv_log "restore-validation complete in ${TOTAL_MS}ms — report=${REPORT}"

rv_exit_code_from_results || exit 1
