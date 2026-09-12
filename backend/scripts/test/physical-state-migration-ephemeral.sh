#!/usr/bin/env bash
# CI-only ephemeral PostgreSQL migration validation for VDC physical-state.
# Creates an isolated temporary database, runs resilient migrate deploy, verifies
# schema invariants, then drops the database. Never targets Production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MIGRATION_NAME="20260912200000_device_connection_physical_state"
TEMP_DB="vdc_phys_mig_${RANDOM}_$(date +%s)"

log() { printf '[physical-state-migration-ephemeral] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    PHYSICAL_STATE_PG_HOST="${PHYSICAL_STATE_PG_HOST:-127.0.0.1}"
    PHYSICAL_STATE_PG_PORT="${PHYSICAL_STATE_PG_PORT:-5432}"
    PHYSICAL_STATE_PG_USER="${PHYSICAL_STATE_PG_USER:-synqdrive}"
    PHYSICAL_STATE_PG_PASSWORD="${PHYSICAL_STATE_PG_PASSWORD:-synqdrive}"
    return 0
  fi

  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  PHYSICAL_STATE_PG_USER="${userpass%%:*}"
  PHYSICAL_STATE_PG_PASSWORD="${userpass#*:}"
  PHYSICAL_STATE_PG_HOST="${hostport%%:*}"
  PHYSICAL_STATE_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${PHYSICAL_STATE_PG_PASSWORD}"

ADMIN_URL="postgresql://${PHYSICAL_STATE_PG_USER}:${PHYSICAL_STATE_PG_PASSWORD}@${PHYSICAL_STATE_PG_HOST}:${PHYSICAL_STATE_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${PHYSICAL_STATE_PG_USER}:${PHYSICAL_STATE_PG_PASSWORD}@${PHYSICAL_STATE_PG_HOST}:${PHYSICAL_STATE_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_MIGRATION_URL="postgresql://${PHYSICAL_STATE_PG_USER}:${PHYSICAL_STATE_PG_PASSWORD}@${PHYSICAL_STATE_PG_HOST}:${PHYSICAL_STATE_PG_PORT}/${TEMP_DB}"

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

log "Verifying migration ${MIGRATION_NAME} is recorded as applied"
applied_count="$(psql_atc "
  SELECT COUNT(*)::text
  FROM _prisma_migrations
  WHERE migration_name = '${MIGRATION_NAME}'
    AND finished_at IS NOT NULL;
")"
applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
if [[ "${applied_count}" != "1" ]]; then
  echo "Expected exactly one applied row for ${MIGRATION_NAME}, got: ${applied_count}" >&2
  exit 1
fi

log "Verifying physical-state tables and TEXT identifier columns"
psql_atc "
DO \$\$
BEGIN
  IF to_regclass('public.device_connection_physical_states') IS NULL THEN
    RAISE EXCEPTION 'missing table device_connection_physical_states';
  END IF;
  IF to_regclass('public.device_connection_physical_state_transitions') IS NULL THEN
    RAISE EXCEPTION 'missing table device_connection_physical_state_transitions';
  END IF;

  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'organization_id'
  ) <> 'text' THEN
    RAISE EXCEPTION 'organization_id must be TEXT';
  END IF;

  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'vehicle_id'
  ) <> 'text' THEN
    RAISE EXCEPTION 'vehicle_id must be TEXT';
  END IF;

  IF (
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_state_transitions'
      AND column_name = 'candidate_state'
  ) <> 'NO' THEN
    RAISE EXCEPTION 'candidate_state must be NOT NULL';
  END IF;
END \$\$;
"

log "Ephemeral migration validation PASS (${MIGRATION_NAME}) on database ${TEMP_DB}"
