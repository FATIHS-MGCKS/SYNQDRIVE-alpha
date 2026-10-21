#!/usr/bin/env bash
# ERD E6.3 — ephemeral PostgreSQL migration gate (M1–M8).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MIGRATION_NAME="20260926120000_vehicle_energy_event_charging_station_enrichment"
TEMP_DB="erd_e6_3_mig_${RANDOM}_$(date +%s)"

log() { printf '[erd-e6-3-migration-ephemeral-gate] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    ERD_E6_3_PG_HOST="${ERD_E6_3_PG_HOST:-127.0.0.1}"
    ERD_E6_3_PG_PORT="${ERD_E6_3_PG_PORT:-5432}"
    ERD_E6_3_PG_USER="${ERD_E6_3_PG_USER:-synqdrive}"
    ERD_E6_3_PG_PASSWORD="${ERD_E6_3_PG_PASSWORD:-synqdrive}"
    return 0
  fi
  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"
  ERD_E6_3_PG_USER="${userpass%%:*}"
  ERD_E6_3_PG_PASSWORD="${userpass#*:}"
  ERD_E6_3_PG_HOST="${hostport%%:*}"
  ERD_E6_3_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${ERD_E6_3_PG_PASSWORD}"
ADMIN_URL="postgresql://${ERD_E6_3_PG_USER}:${ERD_E6_3_PG_PASSWORD}@${ERD_E6_3_PG_HOST}:${ERD_E6_3_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${ERD_E6_3_PG_USER}:${ERD_E6_3_PG_PASSWORD}@${ERD_E6_3_PG_HOST}:${ERD_E6_3_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_MIGRATION_URL="postgresql://${ERD_E6_3_PG_USER}:${ERD_E6_3_PG_PASSWORD}@${ERD_E6_3_PG_HOST}:${ERD_E6_3_PG_PORT}/${TEMP_DB}"

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

log "Running prisma migrate deploy"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

applied_count="$(psql_atc "
  SELECT COUNT(*)::text FROM _prisma_migrations
  WHERE migration_name = '${MIGRATION_NAME}' AND finished_at IS NOT NULL;
")"
applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
if [[ "${applied_count}" != "1" ]]; then
  echo "Expected E6.3 migration applied once, got ${applied_count}" >&2
  exit 1
fi

table_exists="$(psql_atc "
  SELECT COUNT(*)::text FROM information_schema.tables
  WHERE table_name = 'vehicle_energy_event_charging_station_enrichments';
")"
if [[ "$(echo "${table_exists}" | tr -d '[:space:]')" != "1" ]]; then
  echo "E6.3 enrichment table missing" >&2
  exit 1
fi

fuel_cols="$(psql_atc "
  SELECT COUNT(*)::text FROM information_schema.columns
  WHERE table_name = 'vehicle_energy_event_fuel_station_enrichments';
")"
if [[ "$(echo "${fuel_cols}" | tr -d '[:space:]')" -lt 10 ]]; then
  echo "Fuel enrichment table unexpectedly changed" >&2
  exit 1
fi

seed_count="$(psql_atc "SELECT COUNT(*)::text FROM vehicle_energy_event_charging_station_enrichments;")"
if [[ "$(echo "${seed_count}" | tr -d '[:space:]')" != "0" ]]; then
  echo "E6.3 table should start empty" >&2
  exit 1
fi

log "E6.3 migration ephemeral gate passed"
