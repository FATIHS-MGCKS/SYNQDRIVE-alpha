#!/usr/bin/env bash
# Legal Documents — PostgreSQL migration tests (empty + legacy altbestand).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${LEGAL_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${LEGAL_MIGRATION_PG_PORT:-5432}"
PG_USER="${LEGAL_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${LEGAL_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${LEGAL_MIGRATION_PG_ADMIN_DB:-postgres}"

EMPTY_DB="${LEGAL_MIGRATION_EMPTY_DB:-synqdrive_legal_mig_empty}"
LEGACY_DB="${LEGAL_MIGRATION_LEGACY_DB:-synqdrive_legal_mig_legacy}"

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
    npx prisma migrate deploy
}

test_empty_database() {
  echo "==> Migration test: empty database"
  recreate_db "$EMPTY_DB"
  run_migrate_deploy "$EMPTY_DB"
  local count
  count=$(DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${EMPTY_DB}?schema=public" \
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$EMPTY_DB" -tAc \
    "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
  if [[ "${count:-0}" -lt 1 ]]; then
    echo "Expected applied migrations > 0, got: ${count:-0}" >&2
    exit 1
  fi
  echo "Empty DB migration OK (${count} applied migrations)"
}

test_legacy_altbestand() {
  echo "==> Migration test: legacy altbestand"
  recreate_db "$LEGACY_DB"
  run_migrate_deploy "$LEGACY_DB"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${LEGACY_DB}?schema=public" \
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$LEGACY_DB" \
    -v ON_ERROR_STOP=1 -f "$ROOT/scripts/test/fixtures/legal-documents-legacy-altbestand.sql"
  run_migrate_deploy "$LEGACY_DB"
  local active_count
  active_count=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$LEGACY_DB" -tAc \
    "SELECT COUNT(*) FROM organization_legal_documents WHERE status = 'ACTIVE';")
  if [[ "${active_count:-0}" -lt 1 ]]; then
    echo "Expected legacy ACTIVE legal documents >= 1" >&2
    exit 1
  fi
  echo "Legacy altbestand migration OK (${active_count} ACTIVE legal documents)"
}

case "${1:-all}" in
  empty) wait_for_postgres && test_empty_database ;;
  legacy) wait_for_postgres && test_legacy_altbestand ;;
  all)
    wait_for_postgres
    test_empty_database
    test_legacy_altbestand
    echo "==> Legal documents migration tests complete"
    ;;
  *)
    echo "Usage: $0 [empty|legacy|all]" >&2
    exit 1
    ;;
esac
