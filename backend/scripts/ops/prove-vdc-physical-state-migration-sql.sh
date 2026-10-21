#!/usr/bin/env bash
# Prove VDC physical-state migration.sql executes against a realistic pre-migration schema.
# SAFE ISOLATED USE ONLY — dedicated localhost database, never production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SHA="${VDC_PHYSICAL_STATE_PRE_SCHEMA_SHA:-7cb184ffc5926521429f75524a1dcb65579769f6}"
PORT="${VDC_PHYSICAL_STATE_PG_PORT:-5433}"
DB="${VDC_PHYSICAL_STATE_MIGRATION_PROOF_DB:-synqdrive_vdc_physical_state_migration_proof}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PRISMA_BIN="${ROOT}/node_modules/.bin/prisma"
MIGRATION_SQL="${ROOT}/prisma/migrations/20260912200000_device_connection_physical_state/migration.sql"
PRE_SCHEMA="/tmp/vdc-pre-physical-state-schema.prisma"
DATABASE_URL="postgresql://postgres@localhost:${PORT}/${DB}?schema=public"
export DATABASE_URL

log() { printf '[vdc-physical-state-migration-proof] %s\n' "$*"; }

psql_atc() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -Atc \"$1\""
}

assert_eq_or_exit() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '[vdc-physical-state-migration-proof][ASSERT FAIL] %s: expected %s, got %s\n' \
      "${label}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

run_post_migration_assertions() {
  local states_exists transitions_exists org_type vehicle_type candidate_not_null

  states_exists="$(psql_atc "SELECT CASE WHEN to_regclass('public.device_connection_physical_states') IS NOT NULL THEN 'YES' ELSE 'NO' END;")"
  assert_eq_or_exit PHYSICAL_STATES_TABLE_EXISTS "${states_exists}" "YES"

  transitions_exists="$(psql_atc "SELECT CASE WHEN to_regclass('public.device_connection_physical_state_transitions') IS NOT NULL THEN 'YES' ELSE 'NO' END;")"
  assert_eq_or_exit PHYSICAL_STATE_TRANSITIONS_TABLE_EXISTS "${transitions_exists}" "YES"

  org_type="$(psql_atc "
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'organization_id';
  ")"
  assert_eq_or_exit ORGANIZATION_ID_TYPE "${org_type}" "text"

  vehicle_type="$(psql_atc "
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'vehicle_id';
  ")"
  assert_eq_or_exit VEHICLE_ID_TYPE "${vehicle_type}" "text"

  candidate_not_null="$(psql_atc "
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_state_transitions'
      AND column_name = 'candidate_state';
  ")"
  assert_eq_or_exit CANDIDATE_STATE_NOT_NULL "${candidate_not_null}" "NO"

  log "Post-migration assertions PASS"
}

log "Creating isolated database ${DB} on localhost:${PORT}"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"DROP DATABASE IF EXISTS ${DB} WITH (FORCE);\""
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"CREATE DATABASE ${DB};\""

log "Materializing pre-migration schema from ${BASE_SHA}"
git show "${BASE_SHA}:backend/prisma/schema.prisma" > "${PRE_SCHEMA}"
cd "${ROOT}"
"${PRISMA_BIN}" db push --schema="${PRE_SCHEMA}" --accept-data-loss --skip-generate >/tmp/vdc-pre-physical-state-db-push.log 2>&1

log "Verifying physical-state tables are absent before migration SQL"
BEFORE="$(psql_atc "SELECT COALESCE(to_regclass('public.device_connection_physical_states')::text, '');")"
assert_eq_or_exit physical_states_absent_before_migration "${BEFORE}" ""

log "Executing physical-state migration.sql"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -f \"${MIGRATION_SQL}\"" >/tmp/vdc-physical-state-migration-exec.log 2>&1

log "Running hard post-migration schema assertions"
run_post_migration_assertions

log "VDC physical-state migration SQL proof completed successfully"
