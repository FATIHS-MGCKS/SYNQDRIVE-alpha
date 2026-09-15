#!/usr/bin/env bash
# EXP-021 PR-C fleet study registry — PostgreSQL migration deploy proof.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${EXP021_FLEET_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${EXP021_FLEET_MIGRATION_PG_PORT:-5432}"
PG_USER="${EXP021_FLEET_MIGRATION_PG_USER:-exp021_pr1649_test}"
PG_PASSWORD="${EXP021_FLEET_MIGRATION_PG_PASSWORD:-exp021_pr1649_test_local}"
PG_ADMIN_DB="${EXP021_FLEET_MIGRATION_PG_ADMIN_DB:-postgres}"

FRESH_DB="${EXP021_FLEET_MIGRATION_FRESH_DB:-synqdrive_exp021_fleet_mig_fresh}"
CHAIN_DB="${EXP021_FLEET_MIGRATION_CHAIN_DB:-synqdrive_exp021_fleet_mig_chain}"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
}

wait_for_postgres() {
  local attempts=30
  for ((i = 1; i <= attempts; i++)); do
    if psql_admin -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "PostgreSQL not reachable at ${PG_HOST}:${PG_PORT}" >&2
  return 1
}

recreate_db() {
  local db="$1"
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin -c "DROP DATABASE IF EXISTS \"${db}\";"
  psql_admin -c "CREATE DATABASE \"${db}\";"
}

run_migrate_deploy() {
  local db="$1"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${db}?schema=public" \
    PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
    bash scripts/test/prisma-migrate-deploy-resilient.sh
}

assert_pending_zero() {
  local db="$1"
  local pending
  pending=$(DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${db}?schema=public" \
    npx prisma migrate status 2>&1 | grep -c 'have not yet been applied' || true)
  if [[ "${pending:-0}" -gt 0 ]]; then
    echo "Expected zero pending migrations after deploy" >&2
    DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${db}?schema=public" \
      npx prisma migrate status >&2 || true
    exit 1
  fi
}

test_fresh_database() {
  echo "==> EXP-021 fleet migration test: fresh database"
  recreate_db "$FRESH_DB"
  run_migrate_deploy "$FRESH_DB"
  assert_pending_zero "$FRESH_DB"
  local count
  count=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$FRESH_DB" -tAc \
    "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
  if [[ "${count:-0}" -lt 1 ]]; then
    echo "Expected applied migrations > 0, got: ${count:-0}" >&2
    exit 1
  fi
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$FRESH_DB" -tAc \
    "SELECT 1 FROM pg_type WHERE typname = 'Exp021StudyRunClassification';" | grep -q 1
  echo "Fresh DB migration OK (${count} applied migrations)"
}

test_existing_chain() {
  echo "==> EXP-021 fleet migration test: deploy after existing chain"
  recreate_db "$CHAIN_DB"
  run_migrate_deploy "$CHAIN_DB"
  assert_pending_zero "$CHAIN_DB"
  echo "Existing-chain migration OK"
}

wait_for_postgres
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${FRESH_DB}?schema=public"
npx prisma validate
npx prisma generate

case "${1:-all}" in
  fresh) test_fresh_database ;;
  chain) test_existing_chain ;;
  all)
    test_fresh_database
    test_existing_chain
    ;;
  *)
    echo "Usage: $0 [fresh|chain|all]" >&2
    exit 1
    ;;
esac

echo "EXP-021 fleet migration tests passed."
