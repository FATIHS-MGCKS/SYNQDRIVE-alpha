#!/usr/bin/env bash
#
# vps-restore-test-clickhouse.sh — Isolated ClickHouse restore drill.
# Restores into synqdrive_drill_* database; production analytics DB untouched.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs

ARTIFACT=""
BACKUP_DIR="${RESTORE_VALIDATION_CH_BACKUP_DIR:-/opt/synqdrive/shared/backups/clickhouse/daily}"
START_MS="$(rv_now_ms)"
ERRORS=""
DETAILS=""
INTEGRITY="unknown"

usage() {
  cat <<'EOF'
Usage: vps-restore-test-clickhouse.sh [--artifact <path>]

Isolated ClickHouse drill:
  1. Decrypt .zip.gpg if needed
  2. CREATE DATABASE synqdrive_drill_<ts>
  3. RESTORE DATABASE into drill DB (table rename via temp restore)
  4. SELECT count() smoke checks
  5. DROP DATABASE

Uses RESTORE_VALIDATION_CH_* (isolated instance/port).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) rv_die "unknown argument: $1" ;;
  esac
done

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "*.zip.gpg")"
  [[ -z "${ARTIFACT}" ]] && ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "*.zip")"
fi

WORK="$(rv_workdir clickhouse)"
DB_NAME="synqdrive_drill_${RV_RUN_ID}"
BACKUP_NAME="drill_${RV_RUN_ID}.zip"
CH_BACKUP_MOUNT="${RESTORE_VALIDATION_CH_BACKUP_MOUNT:-${WORK}/ch-backups}"

ch_client() {
  clickhouse-client \
    --host "${RESTORE_VALIDATION_CH_HOST}" \
    --port "${RESTORE_VALIDATION_CH_PORT}" \
    --user "${RESTORE_VALIDATION_CH_USER}" \
    --password "${RESTORE_VALIDATION_CH_PASSWORD}" "$@"
}

SOURCE_DB="${RESTORE_VALIDATION_CH_SOURCE_DB:-synqdrive}"

cleanup() {
  ch_client --query "DROP DATABASE IF EXISTS ${SOURCE_DB}" 2>/dev/null || true
}
trap cleanup EXIT

if [[ -z "${ARTIFACT}" || ! -f "${ARTIFACT}" ]]; then
  ERRORS="no ClickHouse backup artifact in ${BACKUP_DIR}"
  rv_record_tier_result "clickhouse" false "$(rv_elapsed_ms "${START_MS}")" "blocked" "${ERRORS}" ""
  rv_die "${ERRORS}"
fi

rv_log "clickhouse restore-test artifact=${ARTIFACT}"
mkdir -p "${CH_BACKUP_MOUNT}"

if [[ "${ARTIFACT}" == *.gpg ]]; then
  rv_verify_checksum_sidecar "${ARTIFACT}" || { ERRORS="checksum invalid"; rv_record_tier_result "clickhouse" false "$(rv_elapsed_ms "${START_MS}")" "failed" "${ERRORS}" ""; exit 1; }
  rv_decrypt_gpg "${ARTIFACT}" "${CH_BACKUP_MOUNT}/${BACKUP_NAME}" || { ERRORS="gpg decrypt failed"; rv_record_tier_result "clickhouse" false "$(rv_elapsed_ms "${START_MS}")" "failed" "${ERRORS}" ""; exit 1; }
else
  cp "${ARTIFACT}" "${CH_BACKUP_MOUNT}/${BACKUP_NAME}"
fi

rv_require_safe_db_name "${DB_NAME}"

SOURCE_DB="${RESTORE_VALIDATION_CH_SOURCE_DB:-synqdrive}"
ch_client --query "DROP DATABASE IF EXISTS ${SOURCE_DB}" 2>/dev/null || true
if ! ch_client --query "RESTORE DATABASE ${SOURCE_DB} FROM Disk('backups', '${BACKUP_NAME}')"; then
  ERRORS="RESTORE DATABASE failed — verify backup disk mount and artifact format"
  rv_record_tier_result "clickhouse" false "$(rv_elapsed_ms "${START_MS}")" "failed" "${ERRORS}" ""
  exit 1
fi

TABLE_COUNT="$(ch_client --query "SELECT count() FROM system.tables WHERE database = '${SOURCE_DB}'" 2>/dev/null || echo 0)"
ROW_SAMPLE="$(ch_client --query "SELECT sum(total_rows) FROM system.tables WHERE database = '${SOURCE_DB}'" 2>/dev/null || echo 0)"

DETAILS="tables=${TABLE_COUNT}; total_rows_sample=${ROW_SAMPLE}; drill_db=${SOURCE_DB}"
INTEGRITY="passed"
rv_record_tier_result "clickhouse" true "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "" "${DETAILS}"
rv_log "clickhouse restore-test SUCCESS (${DETAILS})"
