#!/usr/bin/env bash
#
# vps-restore-test-postgresql.sh — Isolated PostgreSQL restore drill.
# Restores into synqdrive_restore_* only; production DB is never touched.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs

ARTIFACT=""
BACKUP_DIR="${RESTORE_VALIDATION_PG_BACKUP_DIR:-/opt/synqdrive/shared/backups/postgresql/daily}"
KEEP_DB=false
START_MS="$(rv_now_ms)"
ERRORS=""
DETAILS=""
INTEGRITY="unknown"
SUCCESS=false

usage() {
  cat <<'EOF'
Usage: vps-restore-test-postgresql.sh [--artifact <path>]

Isolated restore drill:
  1. Decrypt artifact if .gpg
  2. pg_restore --list syntax check
  3. CREATE DATABASE synqdrive_restore_<ts>
  4. pg_restore into isolated DB
  5. Row-count integrity checks
  6. DROP DATABASE

Requires RESTORE_VALIDATION_PG_* pointing at an isolated Postgres instance.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --keep-db) KEEP_DB=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) rv_die "unknown argument: $1" ;;
  esac
done

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "*.dump.gpg")"
  [[ -z "${ARTIFACT}" ]] && ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "*.dump")"
  [[ -z "${ARTIFACT}" ]] && ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "*.sql.gz")"
fi

WORK="$(rv_workdir postgresql)"
DB_NAME="synqdrive_restore_${RV_RUN_ID}"
PLAIN="${WORK}/restore.dump"

cleanup() {
  [[ "${KEEP_DB}" == "true" ]] && return 0
  rv_pg_admin_psql -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" 2>/dev/null || true
}
trap cleanup EXIT

if [[ -z "${ARTIFACT}" || ! -f "${ARTIFACT}" ]]; then
  ERRORS="no PostgreSQL backup artifact found in ${BACKUP_DIR}"
  INTEGRITY="blocked"
  rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
  rv_die "${ERRORS}"
fi

rv_log "postgresql restore-test artifact=${ARTIFACT}"

if [[ "${ARTIFACT}" == *.gpg ]]; then
  if ! rv_verify_checksum_sidecar "${ARTIFACT}"; then
    ERRORS="checksum sidecar invalid for ${ARTIFACT}"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
  rv_decrypt_gpg "${ARTIFACT}" "${PLAIN}" || { ERRORS="gpg decrypt failed"; INTEGRITY="failed"; rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""; exit 1; }
elif [[ "${ARTIFACT}" == *.sql.gz ]]; then
  gunzip -c "${ARTIFACT}" > "${PLAIN}.sql"
  PLAIN="${PLAIN}.sql"
else
  cp "${ARTIFACT}" "${PLAIN}"
fi

rv_require_safe_db_name "${DB_NAME}"

if [[ "${PLAIN}" == *.sql ]]; then
  if ! rv_pg_admin_psql -c "CREATE DATABASE \"${DB_NAME}\" OWNER ${RESTORE_VALIDATION_PG_USER};"; then
    ERRORS="CREATE DATABASE failed"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
  if ! PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
    -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
    -U "${RESTORE_VALIDATION_PG_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -f "${PLAIN}"; then
    ERRORS="psql restore failed"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
else
  if ! pg_restore --list "${PLAIN}" >/dev/null 2>&1; then
    ERRORS="pg_restore --list failed (corrupt dump)"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
  if ! rv_pg_admin_psql -c "CREATE DATABASE \"${DB_NAME}\" OWNER ${RESTORE_VALIDATION_PG_USER};"; then
    ERRORS="CREATE DATABASE failed"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
  if ! PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" pg_restore \
    -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
    -U "${RESTORE_VALIDATION_PG_USER}" -d "${DB_NAME}" --no-owner --no-privileges "${PLAIN}" 2>/dev/null; then
    :
  fi
  TABLE_EXISTS="$(PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
    -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
    -U "${RESTORE_VALIDATION_PG_USER}" -d "${DB_NAME}" -tAc \
    "SELECT to_regclass('public.organizations') IS NOT NULL;" 2>/dev/null || echo "f")"
  if [[ "${TABLE_EXISTS}" != "t" ]]; then
    ERRORS="pg_restore into isolated DB failed (organizations missing)"
    INTEGRITY="failed"
    rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
    exit 1
  fi
fi

ORG_COUNT="$(PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
  -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
  -U "${RESTORE_VALIDATION_PG_USER}" -d "${DB_NAME}" -tAc \
  "SELECT COUNT(*) FROM organizations;" 2>/dev/null || echo "")"
MIG_COUNT="$(PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
  -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
  -U "${RESTORE_VALIDATION_PG_USER}" -d "${DB_NAME}" -tAc \
  "SELECT COUNT(*) FROM _prisma_migrations;" 2>/dev/null || echo "")"

if [[ -z "${ORG_COUNT}" ]]; then
  ERRORS="integrity query failed (organizations)"
  INTEGRITY="failed"
  rv_record_tier_result "postgresql" false "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "${ERRORS}" ""
  exit 1
fi

DETAILS="organizations=${ORG_COUNT}; prisma_migrations=${MIG_COUNT:-0}; isolated_db=${DB_NAME}"
INTEGRITY="passed"
SUCCESS=true
rv_record_tier_result "postgresql" true "$(rv_elapsed_ms "${START_MS}")" "${INTEGRITY}" "" "${DETAILS}"
rv_log "postgresql restore-test SUCCESS (${DETAILS})"
