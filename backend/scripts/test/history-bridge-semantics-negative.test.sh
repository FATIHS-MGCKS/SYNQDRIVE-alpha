#!/usr/bin/env bash
# Fail-closed negative tests for history-bridge semantic guards (R3B1R.1.1b matrix).
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

psql_test() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 "$@"
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
    echo "FALSE ACCEPTANCE: ${label}" >&2
    exit 1
  fi
  echo "OK negative: ${label}"
}

run_verify_expect_pass() {
  local label="$1"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
    npx ts-node scripts/verify-history-bridge-semantics.ts "$2" >/dev/null
  echo "OK positive: ${label}"
}

setup_short_code_base() {
  recreate_db
  psql_test <<'SQL'
CREATE TABLE public."organizations" ("id" TEXT PRIMARY KEY, "company_name" TEXT NOT NULL);
ALTER TABLE public."organizations" ADD COLUMN "short_code" TEXT;
CREATE UNIQUE INDEX "organizations_short_code_key" ON public."organizations"("short_code");
SQL
}

setup_drive_type_base() {
  recreate_db
  psql_test <<'SQL'
CREATE TYPE public."DriveType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');
CREATE TABLE public."vehicles" ("id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL);
ALTER TABLE public."vehicles" ADD COLUMN "drive_type" public."DriveType";
SQL
}

patch_index_flag() {
  local flag="$1"
  local value="$2"
  psql_test -c "
    UPDATE pg_index ix
    SET ${flag} = ${value}
    FROM pg_class idx
    JOIN pg_namespace n ON n.oid = idx.relnamespace
    WHERE ix.indexrelid = idx.oid
      AND n.nspname = 'public'
      AND idx.relname = 'organizations_short_code_key';
  "
}

setup_short_code_base
run_verify_expect_pass "short_code baseline" short_code

short_code_negative_total=0

short_code_cases=(
  "wrong type|ALTER TABLE public.organizations ALTER COLUMN short_code TYPE varchar(10) USING short_code::varchar(10)"
  "non-null|ALTER TABLE public.organizations ALTER COLUMN short_code SET NOT NULL"
  "default present|ALTER TABLE public.organizations ALTER COLUMN short_code SET DEFAULT 'X'"
  "wrong key|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (company_name)"
  "non-unique index|DROP INDEX public.organizations_short_code_key; CREATE INDEX organizations_short_code_key ON public.organizations (short_code)"
  "partial index|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code) WHERE short_code IS NOT NULL"
  "expression index|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations ((lower(short_code)))"
  "unexpected INCLUDE|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code) INCLUDE (company_name)"
  "wrong collation|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code COLLATE \"C\")"
  "wrong opclass|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code text_pattern_ops)"
  "wrong sort direction|DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code DESC)"
  "wrong access method|DROP INDEX public.organizations_short_code_key; CREATE INDEX organizations_short_code_key ON public.organizations USING brin (short_code)"
)

for entry in "${short_code_cases[@]}"; do
  label="${entry%%|*}"
  sql="${entry#*|}"
  setup_short_code_base
  psql_test -c "$sql"
  run_verify_expect_fail "$label" short_code
  short_code_negative_total=$((short_code_negative_total + 1))
done

if psql_test -c "SELECT rolsuper FROM pg_roles WHERE rolname = current_user;" -tA | grep -q t; then
  setup_short_code_base
  patch_index_flag indisvalid false
  run_verify_expect_fail "invalid index" short_code
  short_code_negative_total=$((short_code_negative_total + 1))

  setup_short_code_base
  patch_index_flag indisready false
  run_verify_expect_fail "not-ready index" short_code
  short_code_negative_total=$((short_code_negative_total + 1))

  setup_short_code_base
  patch_index_flag indislive false
  run_verify_expect_fail "not-live index" short_code
  short_code_negative_total=$((short_code_negative_total + 1))
else
  echo "SKIP catalog-flag negatives: test role is not superuser"
fi

if [[ "$(psql_test -c "SHOW server_version_num;" -tA | tr -d '[:space:]')" -ge 150000 ]]; then
  setup_short_code_base
  psql_test -c "DROP INDEX public.organizations_short_code_key; CREATE UNIQUE INDEX organizations_short_code_key ON public.organizations (short_code) NULLS NOT DISTINCT;"
  run_verify_expect_fail "nulls not distinct" short_code
  short_code_negative_total=$((short_code_negative_total + 1))
else
  echo "SKIP nulls-not-distinct negative: PostgreSQL < 15"
fi

setup_drive_type_base
run_verify_expect_pass "drive_type baseline" drive_type

drive_type_cases=(
  "wrong schema|CREATE SCHEMA alt; ALTER TYPE public.\"DriveType\" SET SCHEMA alt"
  "missing enum label|ALTER TYPE public.\"DriveType\" RENAME VALUE 'FOUR_WD' TO '4WD'"
  "extra enum label|ALTER TYPE public.\"DriveType\" ADD VALUE 'OTHER'"
  "wrong column type|ALTER TABLE public.vehicles ALTER COLUMN drive_type TYPE text USING drive_type::text"
  "non-null column|ALTER TABLE public.vehicles ALTER COLUMN drive_type SET NOT NULL"
  "default present|ALTER TABLE public.vehicles ALTER COLUMN drive_type SET DEFAULT 'FWD'::public.\"DriveType\""
)

for entry in "${drive_type_cases[@]}"; do
  label="${entry%%|*}"
  sql="${entry#*|}"
  setup_drive_type_base
  psql_test -c "$sql"
  run_verify_expect_fail "$label" drive_type
done

setup_drive_type_base
psql_test <<'SQL'
CREATE SCHEMA shadow;
CREATE TYPE shadow."DriveType" AS ENUM ('SHADOW');
SQL
run_verify_expect_pass "same-named type in other schema ignored" drive_type

echo "History bridge semantic negative tests passed (${short_code_negative_total} short_code + ${#drive_type_cases[@]} drive_type + 1 ambiguity)"
echo "SHORT_CODE_NEGATIVE_TESTS_TOTAL=${short_code_negative_total}"
echo "SHORT_CODE_NEGATIVE_TESTS_BLOCKED=${short_code_negative_total}"
echo "SHORT_CODE_FALSE_ACCEPTANCES=0"
