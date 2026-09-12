#!/usr/bin/env bash
# Prove RFRF F2 migration.sql executes against a realistic pre-F2 PostgreSQL schema.
# SAFE ISOLATED USE ONLY — localhost dedicated database, never production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SHA="${RFRF_F2_PRE_SCHEMA_SHA:-503416c82e4daca298e80c134e0baaba4393b768}"
PORT="${RFRF_F2_PG_PORT:-5433}"
DB="${RFRF_F2_MIGRATION_PROOF_DB:-synqdrive_rfrf_f2_migration_proof}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PRISMA_BIN="${ROOT}/node_modules/.bin/prisma"
MIGRATION_SQL="${ROOT}/prisma/migrations/20260912123000_rfrf_f2_raw_refuel_candidates/migration.sql"
PRE_SCHEMA="/tmp/rfrf-pre-f2-schema.prisma"
DATABASE_URL="postgresql://postgres@localhost:${PORT}/${DB}?schema=public"
export DATABASE_URL

REQUIRED_INDEXES=(
  raw_refuel_candidates_vehicle_id_candidate_identity_key_key
  raw_refuel_candidates_organization_id_idx
  raw_refuel_candidates_vehicle_id_lifecycle_state_idx
  raw_refuel_candidates_vehicle_id_physical_evidence_start_idx
  raw_refuel_candidates_vehicle_id_first_observed_at_idx
  raw_refuel_candidates_lifecycle_state_updated_at_idx
)

log() { printf '[rfrf-f2-migration-proof] %s\n' "$*"; }

psql_atc() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -Atc \"$1\""
}

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '[rfrf-f2-migration-proof][ASSERT FAIL] %s: expected %s, got %s\n' \
      "${label}" "${expected}" "${actual}" >&2
    return 1
  fi
  return 0
}

assert_eq_or_exit() {
  assert_eq "$@" || exit 1
}

assert_index_exists() {
  local index_name="$1"
  local found
  found="$(psql_atc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = '${index_name}';")"
  assert_eq_or_exit "index:${index_name}" "${found}" "1"
}

assert_fk_exists() {
  local constraint_name="$1"
  local referenced_table="$2"
  local found
  found="$(psql_atc "
    SELECT COUNT(*)
    FROM pg_constraint c
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE c.conname = '${constraint_name}'
      AND c.contype = 'f'
      AND ref.relname = '${referenced_table}';
  ")"
  assert_eq_or_exit "fk:${constraint_name}->${referenced_table}" "${found}" "1"
}

assert_table_column_exists() {
  local table_name="$1"
  local column_name="$2"
  local found
  found="$(psql_atc "
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${table_name}'
      AND column_name = '${column_name}';
  ")"
  assert_eq_or_exit "sentinel:${table_name}.${column_name}" "${found}" "1"
}

run_post_migration_assertions() {
  local table_exists nullable enum_count candidate_rows sentinels

  table_exists="$(psql_atc "SELECT CASE WHEN to_regclass('public.raw_refuel_candidates') IS NOT NULL THEN 'YES' ELSE 'NO' END;")"
  assert_eq_or_exit RAW_REFUEL_TABLE_EXISTS "${table_exists}" "YES"

  nullable="$(psql_atc "
    SELECT CASE WHEN is_nullable = 'YES' THEN 'YES' ELSE 'NO' END
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_refuel_candidates'
      AND column_name = 'candidate_identity_key';
  ")"
  assert_eq_or_exit CANDIDATE_IDENTITY_KEY_NULLABLE "${nullable}" "YES"

  enum_count="$(psql_atc "
    SELECT COUNT(*)::text
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname IN (
        'RawRefuelCandidateLifecycleState',
        'RawRefuelCandidateSignalChannel',
        'RawRefuelAbsoluteSignalTrust',
        'RawRefuelCandidateRejectionReason'
      );
  ")"
  assert_eq_or_exit EXPECTED_ENUM_COUNT "${enum_count}" "4"

  for index_name in "${REQUIRED_INDEXES[@]}"; do
    assert_index_exists "${index_name}"
  done

  assert_fk_exists raw_refuel_candidates_organization_id_fkey organizations
  assert_fk_exists raw_refuel_candidates_vehicle_id_fkey vehicles

  candidate_rows="$(psql_atc "SELECT COUNT(*)::text FROM raw_refuel_candidates;")"
  assert_eq_or_exit CANDIDATE_ROW_COUNT_AFTER_MIGRATION "${candidate_rows}" "0"

  assert_table_column_exists organizations id
  assert_table_column_exists vehicles id
  assert_table_column_exists vehicle_energy_events id
  assert_table_column_exists vehicle_trips id

  sentinels="$(psql_atc "
    SELECT CASE
      WHEN to_regclass('public.organizations') IS NOT NULL
       AND to_regclass('public.vehicles') IS NOT NULL
       AND to_regclass('public.vehicle_energy_events') IS NOT NULL
       AND to_regclass('public.vehicle_trips') IS NOT NULL
      THEN 'YES'
      ELSE 'NO'
    END;
  ")"
  assert_eq_or_exit BASE_SCHEMA_SENTINEL_PRESERVED "${sentinels}" "YES"

  log "Post-migration assertions PASS"
  log "  RAW_REFUEL_TABLE_EXISTS=YES"
  log "  CANDIDATE_IDENTITY_KEY_NULLABLE=YES"
  log "  EXPECTED_ENUM_COUNT=4"
  log "  EXPECTED_INDEXES_PRESENT=YES (${#REQUIRED_INDEXES[@]} indexes by name)"
  log "  F2_MIGRATION_FOREIGN_KEYS=PASS"
  log "  CANDIDATE_ROW_COUNT_AFTER_MIGRATION=0"
  log "  BASE_SCHEMA_SENTINEL_PRESERVED=YES"
}

run_assertion_self_check() {
  log "Running negative assertion self-check (expect intentional mismatch rejection)"
  if assert_eq self_check_negative_probe PASS FAIL; then
    printf '[rfrf-f2-migration-proof][ASSERT FAIL] self-check accepted wrong value\n' >&2
    exit 1
  fi
  log "Assertion harness self-check PASS (non-zero exit on wrong expected value)"
}

if [[ "${RFRF_F2_MIGRATION_PROOF_SELF_CHECK_ONLY:-}" == "1" ]]; then
  run_assertion_self_check
  exit 0
fi

log "Creating isolated database ${DB} on localhost:${PORT}"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"DROP DATABASE IF EXISTS ${DB} WITH (FORCE);\""
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"CREATE DATABASE ${DB};\""

log "Materializing pre-F2 schema from ${BASE_SHA}"
git show "${BASE_SHA}:backend/prisma/schema.prisma" > "${PRE_SCHEMA}"
cd "${ROOT}"
"${PRISMA_BIN}" db push --schema="${PRE_SCHEMA}" --accept-data-loss --skip-generate >/tmp/rfrf-pre-f2-db-push.log 2>&1

log "Verifying raw_refuel_candidates is absent before F2 SQL"
BEFORE="$(psql_atc "SELECT COALESCE(to_regclass('public.raw_refuel_candidates')::text, '');")"
assert_eq_or_exit raw_refuel_candidates_absent_before_f2 "${BEFORE}" ""

log "Executing F2 migration.sql (single-shot, not idempotent by design)"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -f \"${MIGRATION_SQL}\"" >/tmp/rfrf-f2-migration-exec.log 2>&1

log "Running hard post-migration schema assertions"
run_post_migration_assertions

if [[ "${RFRF_F2_MIGRATION_PROOF_SELF_CHECK:-}" == "1" ]]; then
  run_assertion_self_check
fi

log "F2 migration SQL proof completed successfully (F2_MIGRATION_SCHEMA_ASSERTIONS=PASS)"
