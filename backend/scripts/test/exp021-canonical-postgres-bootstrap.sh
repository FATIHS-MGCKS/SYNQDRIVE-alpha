#!/usr/bin/env bash
# EXP-021 canonical PostgreSQL bootstrap — historical migration-chain compatibility.
# Applies the full Prisma migration chain via prisma-migrate-deploy-resilient.sh,
# verifies pending migrations = 0, and asserts PR-C fleet schema authorities exist.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  PG_HOST="${EXP021_FLEET_MIGRATION_PG_HOST:-127.0.0.1}"
  PG_PORT="${EXP021_FLEET_MIGRATION_PG_PORT:-5432}"
  PG_USER="${EXP021_FLEET_MIGRATION_PG_USER:-exp021_pr1649_test}"
  PG_PASSWORD="${EXP021_FLEET_MIGRATION_PG_PASSWORD:-exp021_pr1649_test_local}"
  PG_DB="${EXP021_FLEET_MIGRATION_DB:-synqdrive_exp021_pr1649_test}"
  export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
fi

export PGPASSWORD="${EXP021_FLEET_MIGRATION_PG_PASSWORD:-exp021_pr1649_test_local}"

extract_db_name() {
  local url="$1"
  echo "$url" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|'
}

assert_ephemeral_database_url() {
  local lower_url="${DATABASE_URL,,}"
  case "$lower_url" in
    *127.0.0.1*|*localhost*) ;;
    *)
      echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
      exit 1
      ;;
  esac
  case "$lower_url" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*)
      echo "DATABASE_URL must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

assert_pending_migrations_zero() {
  local pending
  pending=$(npx prisma migrate status 2>&1 | grep -c 'have not yet been applied' || true)
  if [[ "${pending:-0}" -gt 0 ]]; then
    echo "Expected zero pending migrations after canonical bootstrap" >&2
    npx prisma migrate status >&2 || true
    exit 1
  fi
}

assert_prc_schema_authorities() {
  local db
  db="$(extract_db_name "$DATABASE_URL")"
  local pg_host="${EXP021_FLEET_MIGRATION_PG_HOST:-127.0.0.1}"
  local pg_port="${EXP021_FLEET_MIGRATION_PG_PORT:-5432}"
  local pg_user="${EXP021_FLEET_MIGRATION_PG_USER:-exp021_pr1649_test}"

  psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$db" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_type WHERE typname = 'Exp021StudyRunClassification';" | grep -q 1

  psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$db" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'exp021_studies';" | grep -q 1

  psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$db" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'exp021_study_runs';" | grep -q 1
}

assert_ephemeral_database_url

echo "==> EXP-021 canonical PostgreSQL bootstrap"
echo "DATABASE_URL=${DATABASE_URL}"

echo "==> prisma validate"
npx prisma validate

echo "==> prisma generate"
npx prisma generate

echo "==> prisma migrate deploy (resilient historical compatibility)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

echo "==> verify pending migrations = 0"
assert_pending_migrations_zero

echo "==> verify PR-C fleet schema authorities"
assert_prc_schema_authorities

echo "EXP-021 canonical PostgreSQL bootstrap OK"
