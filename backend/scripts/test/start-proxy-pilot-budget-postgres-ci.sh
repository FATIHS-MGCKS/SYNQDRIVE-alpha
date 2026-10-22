#!/usr/bin/env bash
# G5C-N16 P4H-R9 — start-proxy pilot provider budget PostgreSQL integration (ephemeral only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TEMP_DB="p4c_start_proxy_pilot_${RANDOM}_$(date +%s)"
PILOT_MIGRATION="20261021150000_battery_start_proxy_pilot_forward_capture"

log() { printf '[start-proxy-pilot-budget-postgres-ci] %s\n' "$*"; }

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    P4C_PG_HOST="${P4C_PG_HOST:-127.0.0.1}"
    P4C_PG_PORT="${P4C_PG_PORT:-5432}"
    P4C_PG_USER="${P4C_PG_USER:-synqdrive}"
    P4C_PG_PASSWORD="${P4C_PG_PASSWORD:-synqdrive}"
    return 0
  fi

  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"

  P4C_PG_USER="${userpass%%:*}"
  P4C_PG_PASSWORD="${userpass#*:}"
  P4C_PG_HOST="${hostport%%:*}"
  P4C_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${P4C_PG_PASSWORD}"

ADMIN_URL="postgresql://${P4C_PG_USER}:${P4C_PG_PASSWORD}@${P4C_PG_HOST}:${P4C_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${P4C_PG_USER}:${P4C_PG_PASSWORD}@${P4C_PG_HOST}:${P4C_PG_PORT}/${TEMP_DB}?schema=public"

cleanup_ephemeral_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}

trap cleanup_ephemeral_db EXIT

case "${MIGRATION_DATABASE_URL,,}" in
  *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*)
    echo "Refusing production-like database host" >&2
    exit 1
    ;;
esac

if ! psql "${ADMIN_URL}" -c 'SELECT 1' >/dev/null 2>&1; then
  log "PostgreSQL unreachable at ${P4C_PG_HOST}:${P4C_PG_PORT}"
  exit 1
fi

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

log "prisma migrate deploy (resilient)"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

applied_count="$(psql "${MIGRATION_DATABASE_URL%%\?*}" -tAc "
  SELECT COUNT(*)::text FROM _prisma_migrations
  WHERE migration_name = '${PILOT_MIGRATION}' AND finished_at IS NOT NULL;
")"
applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
if [[ "${applied_count}" != "1" ]]; then
  echo "Expected applied migration ${PILOT_MIGRATION}, got count=${applied_count}" >&2
  exit 1
fi

SPEC="src/modules/vehicle-intelligence/battery-health/lv-start-proxy/start-proxy-pilot-provider-budget.postgres.integration.spec.ts"

log "start-proxy pilot budget postgres integration"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  BATTERY_V2_START_PROXY_PILOT_INTEGRATION=1 \
  npx jest --runTestsByPath "$SPEC" --runInBand --verbose

log "start-proxy-pilot-budget-postgres-ci completed successfully"
