#!/usr/bin/env bash
# Ephemeral PostgreSQL validation for VO-2 vehicle onboarding migration.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MIGRATION_NAME="20260930130000_vehicle_onboarding_vo2_persistence"
TEMP_DB="vo2_mig_${RANDOM}_$(date +%s)"

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    VO2_PG_HOST="${VO2_PG_HOST:-127.0.0.1}"
    VO2_PG_PORT="${VO2_PG_PORT:-5432}"
    VO2_PG_USER="${VO2_PG_USER:-synqdrive}"
    VO2_PG_PASSWORD="${VO2_PG_PASSWORD:-synqdrive}"
    return 0
  fi
  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"
  VO2_PG_USER="${userpass%%:*}"
  VO2_PG_PASSWORD="${userpass#*:}"
  VO2_PG_HOST="${hostport%%:*}"
  VO2_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${VO2_PG_PASSWORD}"
ADMIN_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${TEMP_DB}"

psql_atc() { psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -tAc "$1"; }

cleanup() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"
DATABASE_URL="${MIGRATION_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

applied="$(psql_atc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}' AND finished_at IS NOT NULL;")"
applied="$(echo "${applied}" | tr -d '[:space:]')"
[[ "${applied}" == "1" ]] || { echo "Migration not applied: ${applied}" >&2; exit 1; }

psql_atc "SELECT COUNT(*) FROM vehicle_onboarding_cases" >/dev/null
psql_atc "SELECT COUNT(*) FROM vehicle_registry_lifecycle_outbox" >/dev/null

echo "[vo2-migration-ephemeral] OK"
