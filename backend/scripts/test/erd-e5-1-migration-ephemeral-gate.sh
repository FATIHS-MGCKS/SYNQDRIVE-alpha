#!/usr/bin/env bash
# ERD E5.1 — ephemeral PostgreSQL migration + PG-A…PG-K gate.
# Uses prisma migrate deploy (not db push) so migration-only CHECK constraints apply.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENUM_MIGRATION_NAME="20260924180000_erd_e5_1_recharge_projection_enum_value"
FOUNDATION_MIGRATION_NAME="20260924181000_erd_e5_1_recharge_projection_foundation"
TEMP_DB="erd_e5_1_mig_${RANDOM}_$(date +%s)"

log() { printf '[erd-e5-1-migration-ephemeral-gate] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    ERD_E5_1_PG_HOST="${ERD_E5_1_PG_HOST:-127.0.0.1}"
    ERD_E5_1_PG_PORT="${ERD_E5_1_PG_PORT:-5432}"
    ERD_E5_1_PG_USER="${ERD_E5_1_PG_USER:-synqdrive}"
    ERD_E5_1_PG_PASSWORD="${ERD_E5_1_PG_PASSWORD:-synqdrive}"
    return 0
  fi

  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  ERD_E5_1_PG_USER="${userpass%%:*}"
  ERD_E5_1_PG_PASSWORD="${userpass#*:}"
  ERD_E5_1_PG_HOST="${hostport%%:*}"
  ERD_E5_1_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${ERD_E5_1_PG_PASSWORD}"

ADMIN_URL="postgresql://${ERD_E5_1_PG_USER}:${ERD_E5_1_PG_PASSWORD}@${ERD_E5_1_PG_HOST}:${ERD_E5_1_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${ERD_E5_1_PG_USER}:${ERD_E5_1_PG_PASSWORD}@${ERD_E5_1_PG_HOST}:${ERD_E5_1_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_MIGRATION_URL="postgresql://${ERD_E5_1_PG_USER}:${ERD_E5_1_PG_PASSWORD}@${ERD_E5_1_PG_HOST}:${ERD_E5_1_PG_PORT}/${TEMP_DB}"

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

log "Running resilient prisma migrate deploy on ephemeral database"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

log "Verifying E5.1 migrations are recorded as applied"
for mig in "${ENUM_MIGRATION_NAME}" "${FOUNDATION_MIGRATION_NAME}"; do
  applied_count="$(psql_atc "
    SELECT COUNT(*)::text
    FROM _prisma_migrations
    WHERE migration_name = '${mig}'
      AND finished_at IS NOT NULL;
  ")"
  applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
  if [[ "${applied_count}" != "1" ]]; then
    echo "Expected exactly one applied row for ${mig}, got: ${applied_count}" >&2
    exit 1
  fi
done

log "Verifying vehicle_energy_events_source_identity_check exists"
check_count="$(psql_atc "
  SELECT COUNT(*)::text
  FROM pg_constraint
  WHERE conname = 'vehicle_energy_events_source_identity_check';
")"
check_count="$(echo "${check_count}" | tr -d '[:space:]')"
if [[ "${check_count}" != "1" ]]; then
  echo "Expected vehicle_energy_events_source_identity_check constraint, got count: ${check_count}" >&2
  exit 1
fi

log "Running E5.1 PG-A…PG-K integration tests on migrate-deploy database"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  ERD_E5_1_POSTGRES_INTEGRATION=1 \
  ERD_E5_1_POSTGRES_REQUIRED=1 \
  npx jest erd-e5-1-recharge-projection-foundation.postgres.integration --runInBand --verbose

log "ERD_E5_1_MIGRATION_EPHEMERAL_GATE=PASS database=${TEMP_DB}"
