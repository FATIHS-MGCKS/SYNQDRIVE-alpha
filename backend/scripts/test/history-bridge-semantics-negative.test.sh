#!/usr/bin/env bash
# Fail-closed negative tests for history-bridge semantic guards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${LEGAL_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${LEGAL_MIGRATION_PG_PORT:-5432}"
PG_USER="${LEGAL_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${LEGAL_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${LEGAL_MIGRATION_PG_ADMIN_DB:-postgres}"
TEST_DB="synqdrive_history_bridge_negative"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
}

recreate_db() {
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin -c "DROP DATABASE IF EXISTS \"${TEST_DB}\";"
  psql_admin -c "CREATE DATABASE \"${TEST_DB}\";"
}

run_verify_expect_fail() {
  local label="$1"
  set +e
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
    npx ts-node scripts/verify-history-bridge-semantics.ts "$2" >/dev/null 2>&1
  local code=$?
  set -e
  if [[ "$code" -eq 0 ]]; then
    echo "Expected verify failure for ${label}, but it passed" >&2
    exit 1
  fi
  echo "OK negative: ${label}"
}

setup_short_code_base() {
  recreate_db
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "organizations" ("id" TEXT PRIMARY KEY, "company_name" TEXT NOT NULL);
ALTER TABLE "organizations" ADD COLUMN "short_code" TEXT;
CREATE UNIQUE INDEX "organizations_short_code_key" ON "organizations"("short_code");
SQL
}

setup_drive_type_base() {
  recreate_db
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TYPE "DriveType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');
CREATE TABLE "vehicles" ("id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL);
ALTER TABLE "vehicles" ADD COLUMN "drive_type" "DriveType";
SQL
}

setup_short_code_base
DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
  npx ts-node scripts/verify-history-bridge-semantics.ts short_code >/dev/null
echo "OK positive: short_code baseline"

short_code_cases=(
  "wrong type|ALTER TABLE organizations ALTER COLUMN short_code TYPE varchar(10) USING short_code::varchar(10)"
  "non-null|ALTER TABLE organizations ALTER COLUMN short_code SET NOT NULL"
  "default present|ALTER TABLE organizations ALTER COLUMN short_code SET DEFAULT 'X'"
  "wrong key|DROP INDEX organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON organizations (company_name)"
  "non-unique index|DROP INDEX organizations_short_code_key; CREATE INDEX organizations_short_code_key ON organizations (short_code)"
  "partial index|DROP INDEX organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON organizations (short_code) WHERE short_code IS NOT NULL"
  "expression index|DROP INDEX organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON organizations ((lower(short_code)))"
)

for entry in "${short_code_cases[@]}"; do
  label="${entry%%|*}"
  sql="${entry#*|}"
  setup_short_code_base
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -c "$sql"
  run_verify_expect_fail "$label" short_code
done

setup_drive_type_base
DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
  npx ts-node scripts/verify-history-bridge-semantics.ts drive_type >/dev/null
echo "OK positive: drive_type baseline"

drive_type_cases=(
  "wrong schema|CREATE SCHEMA alt; ALTER TYPE \"DriveType\" SET SCHEMA alt"
  "missing enum label|ALTER TYPE \"DriveType\" RENAME VALUE 'FOUR_WD' TO '4WD'"
  "extra enum label|ALTER TYPE \"DriveType\" ADD VALUE 'OTHER'"
  "wrong column type|ALTER TABLE vehicles ALTER COLUMN drive_type TYPE text USING drive_type::text"
  "non-null column|ALTER TABLE vehicles ALTER COLUMN drive_type SET NOT NULL"
  "default present|ALTER TABLE vehicles ALTER COLUMN drive_type SET DEFAULT 'FWD'::\"DriveType\""
)

for entry in "${drive_type_cases[@]}"; do
  label="${entry%%|*}"
  sql="${entry#*|}"
  setup_drive_type_base
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -c "$sql"
  run_verify_expect_fail "$label" drive_type
done

echo "History bridge semantic negative tests passed (${#short_code_cases[@]} short_code + ${#drive_type_cases[@]} drive_type)"
