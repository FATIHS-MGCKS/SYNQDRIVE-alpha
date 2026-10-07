#!/usr/bin/env bash
# VO-5B registry lifecycle → billing PostgreSQL CI gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export VO5B_REGISTRY_BILLING_PG=1
export VO5B_AB1_REGISTRY_BILLING_PG=1

parse_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    VO5B_PG_HOST="${VO5B_PG_HOST:-127.0.0.1}"
    VO5B_PG_PORT="${VO5B_PG_PORT:-5432}"
    VO5B_PG_USER="${VO5B_PG_USER:-synqdrive}"
    VO5B_PG_PASSWORD="${VO5B_PG_PASSWORD:-synqdrive}"
    return 0
  fi
  local base="${DATABASE_URL%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"
  VO5B_PG_USER="${userpass%%:*}"
  VO5B_PG_PASSWORD="${userpass#*:}"
  VO5B_PG_HOST="${hostport%%:*}"
  VO5B_PG_PORT="${hostport#*:}"
}

parse_database_url
export PGPASSWORD="${VO5B_PG_PASSWORD}"
ADMIN_URL="postgresql://${VO5B_PG_USER}:${VO5B_PG_PASSWORD}@${VO5B_PG_HOST}:${VO5B_PG_PORT}/postgres"
INT_DB="vo5b_integration_${RANDOM}_$(date +%s)"
INT_DATABASE_URL="postgresql://${VO5B_PG_USER}:${VO5B_PG_PASSWORD}@${VO5B_PG_HOST}:${VO5B_PG_PORT}/${INT_DB}?schema=public"

cleanup_int_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${INT_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${INT_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup_int_db EXIT

psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${INT_DB}\";"
export DATABASE_URL="${INT_DATABASE_URL}"

DATABASE_URL="${INT_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh
npm run test:vehicle-onboarding:vo5b:postgres
npm run test:vehicle-onboarding:vo5b-ab1:postgres
