#!/usr/bin/env bash
# VO-2 / VO-2.1 PostgreSQL CI gate: fresh migrate, legacy upgrade, integration tests.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export VO2_PERSISTENCE_PG=1

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
INT_DB="vo2_integration_${RANDOM}_$(date +%s)"
INT_DATABASE_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${INT_DB}?schema=public"

cleanup_int_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${INT_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${INT_DB}\";" >/dev/null 2>&1 || true
}

log_ci() { printf '[vo2-postgres-ci] %s\n' "$*"; }

bash scripts/test/vo2-vehicle-onboarding-migration-ephemeral.sh
bash scripts/test/vo2-vehicle-onboarding-migration-legacy-upgrade.sh

log_ci "Creating integration database ${INT_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${INT_DB}\";"
trap cleanup_int_db EXIT

log_ci "Applying full migration chain to integration database"
DATABASE_URL="${INT_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

applied_vo21="$(psql "postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${INT_DB}" -tAc \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260930140000_vehicle_onboarding_vo2_1_integrity' AND finished_at IS NOT NULL;")"
applied_vo21="$(echo "${applied_vo21}" | tr -d '[:space:]')"
[[ "${applied_vo21}" == "1" ]] || { log_ci "VO-2.1 migration not applied on integration DB"; exit 1; }

DATABASE_URL="${INT_DATABASE_URL}" npx jest vo2-persistence.postgres.integration --runInBand --forceExit

export VO3_ORCHESTRATOR_PG=1
DATABASE_URL="${INT_DATABASE_URL}" npx jest vo3-orchestrator.postgres.integration --runInBand --forceExit

export VO4_READINESS_PG=1
DATABASE_URL="${INT_DATABASE_URL}" npx jest vo4-readiness.postgres.integration --runInBand --forceExit

log_ci "all gates passed"
