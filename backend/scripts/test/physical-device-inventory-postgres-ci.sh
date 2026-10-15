#!/usr/bin/env bash
# Ephemeral PostgreSQL certification for Physical Device Inventory P1A.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TEMP_DB="pdi_p1a_pg_${RANDOM}_$(date +%s)"
PDI_MIGRATION_P1A="20261015143000_physical_device_inventory_p1a"
PDI_MIGRATION_HARDENING="20261015170000_physical_device_inventory_p1a_hardening"
PDI_MIGRATION_P1B1="20261015193000_physical_device_inventory_p1b1"
PDI_MIGRATION_P1B1_HARDENING="20261015220000_pdi_p1b1_hardening_and_dimo_schema_sync"

log() { printf '[physical-device-inventory-postgres-ci] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    PDI_PG_HOST="${PDI_PG_HOST:-127.0.0.1}"
    PDI_PG_PORT="${PDI_PG_PORT:-5432}"
    PDI_PG_USER="${PDI_PG_USER:-synqdrive}"
    PDI_PG_PASSWORD="${PDI_PG_PASSWORD:-synqdrive}"
    return 0
  fi

  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  PDI_PG_USER="${userpass%%:*}"
  PDI_PG_PASSWORD="${userpass#*:}"
  PDI_PG_HOST="${hostport%%:*}"
  PDI_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${PDI_PG_PASSWORD}"

ADMIN_URL="postgresql://${PDI_PG_USER}:${PDI_PG_PASSWORD}@${PDI_PG_HOST}:${PDI_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${PDI_PG_USER}:${PDI_PG_PASSWORD}@${PDI_PG_HOST}:${PDI_PG_PORT}/${TEMP_DB}?schema=public"

cleanup_ephemeral_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}

trap cleanup_ephemeral_db EXIT

if ! psql "${ADMIN_URL}" -c 'SELECT 1' >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    log "PostgreSQL unreachable and Docker unavailable — cannot bootstrap ephemeral database"
    exit 1
  fi
  bash scripts/test/ci-start-postgres.sh
fi

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

log "Resilient prisma migrate deploy (ephemeral recovery enabled)"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

for mig in "${PDI_MIGRATION_P1A}" "${PDI_MIGRATION_HARDENING}" "${PDI_MIGRATION_P1B1}" "${PDI_MIGRATION_P1B1_HARDENING}"; do
  applied_count="$(psql "${MIGRATION_DATABASE_URL%%\?*}" -tAc "
    SELECT COUNT(*)::text FROM _prisma_migrations
    WHERE migration_name = '${mig}' AND finished_at IS NOT NULL;
  ")"
  applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
  if [[ "${applied_count}" != "1" ]]; then
    echo "Expected applied migration ${mig}, got count=${applied_count}" >&2
    exit 1
  fi
done

log "Running Physical Device Inventory PostgreSQL integration suite"
export PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION=1
export PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED=1
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  npm run test:physical-device-inventory:postgres -- --verbose

log "PostgreSQL certification complete"
