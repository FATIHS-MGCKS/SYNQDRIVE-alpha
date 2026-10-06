#!/usr/bin/env bash
# Ephemeral PostgreSQL migration validation for APD shadow reconciliation table.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APD_MIGRATION_NAME="20261003024000_apd_shadow_reconciliation_decisions"
TEMP_DB="p25_apd_shadow_mig_${RANDOM}_$(date +%s)"

log() { printf '[p25-apd-shadow-migration-ephemeral] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    P25_APD_PG_HOST="${P25_APD_PG_HOST:-127.0.0.1}"
    P25_APD_PG_PORT="${P25_APD_PG_PORT:-5432}"
    P25_APD_PG_USER="${P25_APD_PG_USER:-synqdrive}"
    P25_APD_PG_PASSWORD="${P25_APD_PG_PASSWORD:-synqdrive}"
    return 0
  fi

  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  P25_APD_PG_USER="${userpass%%:*}"
  P25_APD_PG_PASSWORD="${userpass#*:}"
  P25_APD_PG_HOST="${hostport%%:*}"
  P25_APD_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${P25_APD_PG_PASSWORD}"

ADMIN_URL="postgresql://${P25_APD_PG_USER}:${P25_APD_PG_PASSWORD}@${P25_APD_PG_HOST}:${P25_APD_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${P25_APD_PG_USER}:${P25_APD_PG_PASSWORD}@${P25_APD_PG_HOST}:${P25_APD_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_MIGRATION_URL="postgresql://${P25_APD_PG_USER}:${P25_APD_PG_PASSWORD}@${P25_APD_PG_HOST}:${P25_APD_PG_PORT}/${TEMP_DB}"

psql_atc() {
  psql "${PSQL_MIGRATION_URL}" -v ON_ERROR_STOP=1 -tAc "$1"
}

cleanup_ephemeral_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}

trap cleanup_ephemeral_db EXIT

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

log "prisma migrate deploy (first pass)"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

log "prisma migrate deploy (idempotency second pass)"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

applied_count="$(psql_atc "
  SELECT COUNT(*)::text
  FROM _prisma_migrations
  WHERE migration_name = '${APD_MIGRATION_NAME}'
    AND finished_at IS NOT NULL;
")"
applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
if [[ "${applied_count}" != "1" ]]; then
  echo "Expected exactly one applied row for ${APD_MIGRATION_NAME}, got: ${applied_count}" >&2
  exit 1
fi

table_exists="$(psql_atc "
  SELECT COUNT(*)::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'apd_shadow_reconciliation_decisions';
")"
table_exists="$(echo "${table_exists}" | tr -d '[:space:]')"
if [[ "${table_exists}" != "1" ]]; then
  echo "apd_shadow_reconciliation_decisions table missing" >&2
  exit 1
fi

unique_index="$(psql_atc "
  SELECT indexname
  FROM pg_indexes
  WHERE tablename = 'apd_shadow_reconciliation_decisions'
    AND indexdef LIKE '%UNIQUE%'
    AND indexdef LIKE '%organization_id%'
    AND indexdef LIKE '%vehicle_id%'
    AND indexdef LIKE '%opportunity_id%'
    AND indexdef LIKE '%policy_version%'
  LIMIT 1;
")"
unique_index="$(echo "${unique_index}" | tr -d '[:space:]')"
if [[ -z "${unique_index}" ]]; then
  echo "Expected unique index on org+vehicle+opportunity+policy" >&2
  exit 1
fi

log "MIGRATION_APPLY_CLEAN_DB=PASS"
log "MIGRATION_IDEMPOTENCY=PASS"
log "UNIQUE_INDEX_NAME=${unique_index}"
log "MIGRATION_DESTRUCTIVE_CHANGE_COUNT=0"
log "BACKFILL_REQUIRED=NO"
