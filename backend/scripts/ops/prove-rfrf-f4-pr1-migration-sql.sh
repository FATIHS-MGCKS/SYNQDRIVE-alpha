#!/usr/bin/env bash
# Prove RFRF F4-PR1 migration.sql against a realistic pre-F4 PostgreSQL schema.
# SAFE ISOLATED USE ONLY — localhost dedicated database, never production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SHA="${RFRF_F4_PRE_SCHEMA_SHA:-ca16ca034809a9bad2c47a0f06f3b908f83bfaf9}"
PORT="${RFRF_F4_PG_PORT:-5433}"
DB="${RFRF_F4_MIGRATION_PROOF_DB:-synqdrive_rfrf_f4_pr1_migration_proof}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PRISMA_BIN="${ROOT}/node_modules/.bin/prisma"
MIGRATION_SQL="${ROOT}/prisma/migrations/20260913120000_rfrf_f4_pr1_vehicle_energy_event_source_identity/migration.sql"
PRE_SCHEMA="/tmp/rfrf-pre-f4-schema.prisma"
DATABASE_URL="postgresql://postgres@localhost:${PORT}/${DB}?schema=public"
export DATABASE_URL

log() { printf '[rfrf-f4-pr1-migration-proof] %s\n' "$*"; }

psql_atc() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -Atc \"$1\""
}

psql_exec() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -c \"$1\""
}

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '[rfrf-f4-pr1-migration-proof][ASSERT FAIL] %s: expected %s, got %s\n' \
      "${label}" "${expected}" "${actual}" >&2
    return 1
  fi
  return 0
}

assert_eq_or_exit() {
  assert_eq "$@" || exit 1
}

seed_minimal_vehicle_graph() {
  psql_exec "
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES ('org-f4-pr1', 'F4 PR1 Proof Org', 'RENTAL', NOW(), NOW())
    ON CONFLICT DO NOTHING;
  "
  psql_exec "
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, status, created_at, updated_at
    ) VALUES (
      'veh-f4-a', 'org-f4-pr1', 'VINFA', 'Make', 'Model', 2024, 'GASOLINE', 'AVAILABLE', NOW(), NOW()
    ), (
      'veh-f4-b', 'org-f4-pr1', 'VINFB', 'Make', 'Model', 2024, 'GASOLINE', 'AVAILABLE', NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;
  "
}

insert_legacy_vee_row() {
  local id="$1"
  local vehicle_id="$2"
  local dimo_segment_id="$3"
  psql_exec "
    INSERT INTO vehicle_energy_events (
      id, vehicle_id, dimo_segment_id, kind, detection_mechanism,
      start_time, end_time, duration_seconds, confidence, created_at, updated_at
    ) VALUES (
      '${id}', '${vehicle_id}', '${dimo_segment_id}', 'REFUEL', 'native-test',
      NOW() - interval '1 hour', NOW(), 3600, 'MEDIUM', NOW(), NOW()
    );
  "
}

run_post_migration_assertions() {
  local enum_count nullable unique_index

  enum_count="$(psql_atc "
    SELECT COUNT(*)::text
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'VehicleEnergyEventDetectionSource';
  ")"
  assert_eq_or_exit DETECTION_SOURCE_ENUM_EXISTS "${enum_count}" "1"

  nullable="$(psql_atc "
    SELECT CASE WHEN is_nullable = 'YES' THEN 'YES' ELSE 'NO' END
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_energy_events'
      AND column_name = 'source_event_key';
  ")"
  assert_eq_or_exit SOURCE_EVENT_KEY_NULLABLE "${nullable}" "YES"

  unique_index="$(psql_atc "
    SELECT COUNT(*)::text
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'vehicle_energy_events_vehicle_id_source_event_key_key';
  ")"
  assert_eq_or_exit FALLBACK_IDENTITY_UNIQUE_INDEX "${unique_index}" "1"

  seed_minimal_vehicle_graph

  insert_legacy_vee_row 'vee-null-1' 'veh-f4-a' 'dimo-seg-null-1'
  insert_legacy_vee_row 'vee-null-2' 'veh-f4-a' 'dimo-seg-null-2'

  local null_rows
  null_rows="$(psql_atc "
    SELECT COUNT(*)::text
    FROM vehicle_energy_events
    WHERE vehicle_id = 'veh-f4-a'
      AND source_event_key IS NULL;
  ")"
  assert_eq_or_exit MULTIPLE_LEGACY_NULL_ROWS_ALLOWED "${null_rows}" "2"

  psql_exec "
    INSERT INTO vehicle_energy_events (
      id, vehicle_id, dimo_segment_id, detection_source, source_event_key,
      kind, detection_mechanism, start_time, end_time, duration_seconds,
      confidence, created_at, updated_at
    ) VALUES (
      'vee-fallback-a', 'veh-f4-a', 'dimo-seg-key-a', 'SYNQDRIVE_RAW_FUEL_FALLBACK',
      'candidate-key-shared', 'REFUEL', 'fallback-test',
      NOW() - interval '30 minutes', NOW(), 1800, 'MEDIUM', NOW(), NOW()
    );
  "

  psql_exec "
    INSERT INTO vehicle_energy_events (
      id, vehicle_id, dimo_segment_id, detection_source, source_event_key,
      kind, detection_mechanism, start_time, end_time, duration_seconds,
      confidence, created_at, updated_at
    ) VALUES (
      'vee-fallback-b', 'veh-f4-b', 'dimo-seg-key-b', 'SYNQDRIVE_RAW_FUEL_FALLBACK',
      'candidate-key-shared', 'REFUEL', 'fallback-test',
      NOW() - interval '20 minutes', NOW(), 1200, 'MEDIUM', NOW(), NOW()
    );
  "

  local cross_vehicle
  cross_vehicle="$(psql_atc "
    SELECT COUNT(*)::text
    FROM vehicle_energy_events
    WHERE source_event_key = 'candidate-key-shared';
  ")"
  assert_eq_or_exit SAME_KEY_DIFFERENT_VEHICLES_ALLOWED "${cross_vehicle}" "2"

  log "Post-migration behavioral assertions PASS"
}

log "Creating isolated database ${DB} on localhost:${PORT}"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"DROP DATABASE IF EXISTS ${DB} WITH (FORCE);\""
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"CREATE DATABASE ${DB};\""

log "Materializing pre-F4 schema from ${BASE_SHA}"
git show "${BASE_SHA}:backend/prisma/schema.prisma" > "${PRE_SCHEMA}"
cd "${ROOT}"
"${PRISMA_BIN}" db push --schema="${PRE_SCHEMA}" --accept-data-loss --skip-generate >/tmp/rfrf-pre-f4-db-push.log 2>&1

log "Verifying F4 columns absent before migration SQL"
BEFORE="$(psql_atc "
  SELECT COUNT(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vehicle_energy_events'
    AND column_name IN ('detection_source', 'source_event_key');
")"
assert_eq_or_exit f4_columns_absent_before_migration "${BEFORE}" "0"

log "Executing F4-PR1 migration.sql"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -f \"${MIGRATION_SQL}\"" >/tmp/rfrf-f4-pr1-migration-exec.log 2>&1

run_post_migration_assertions

log "Testing duplicate (vehicle_id, source_event_key) rejection"
if psql_exec "
  INSERT INTO vehicle_energy_events (
    id, vehicle_id, dimo_segment_id, detection_source, source_event_key,
    kind, detection_mechanism, start_time, end_time, duration_seconds,
    confidence, created_at, updated_at
  ) VALUES (
    'vee-dup-should-fail', 'veh-f4-a', 'dimo-seg-dup', 'SYNQDRIVE_RAW_FUEL_FALLBACK',
    'candidate-key-shared', 'REFUEL', 'fallback-test',
    NOW() - interval '10 minutes', NOW(), 600, 'MEDIUM', NOW(), NOW()
  );
" >/tmp/rfrf-f4-pr1-dup-expect-fail.log 2>&1; then
  printf '[rfrf-f4-pr1-migration-proof][ASSERT FAIL] duplicate vehicle+source_event_key was accepted\n' >&2
  exit 1
fi
log "Duplicate (vehicle_id, source_event_key) correctly rejected"

log "F4-PR1 migration SQL proof completed successfully (F4_PR1_MIGRATION_SCHEMA_ASSERTIONS=PASS)"
