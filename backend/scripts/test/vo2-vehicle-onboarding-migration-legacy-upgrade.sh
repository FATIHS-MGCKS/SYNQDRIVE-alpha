#!/usr/bin/env bash
# VO-2.1 — upgrade from schema immediately before VO-2 with representative legacy rows.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

HELD_MIGRATIONS=(
  "20260930130000_vehicle_onboarding_vo2_persistence"
  "20260930140000_vehicle_onboarding_vo2_1_integrity"
)
STAGING_DIR="${VO2_HELD_MIGRATIONS_DIR:-/tmp/vo2-held-migrations}"
TEMP_DB="vo2_legacy_upg_${RANDOM}_$(date +%s)"
FIXTURE_IDS="/tmp/vo2-fixture-ids-${TEMP_DB}.json"

log() { printf '[vo2-legacy-upgrade] %s\n' "$*"; }
fail() { printf '[vo2-legacy-upgrade][FAIL] %s\n' "$*" >&2; exit 1; }

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
MIGRATION_DATABASE_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${TEMP_DB}?schema=public"
PSQL_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${TEMP_DB}"

psql_atc() { psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -tAc "$1"; }

restore_migrations() {
  for name in "${HELD_MIGRATIONS[@]}"; do
    if [[ -d "${STAGING_DIR}/${name}" ]]; then
      mv "${STAGING_DIR}/${name}" "${ROOT}/prisma/migrations/${name}"
    fi
  done
}

hold_migrations() {
  mkdir -p "${STAGING_DIR}"
  for name in "${HELD_MIGRATIONS[@]}"; do
    local src="${ROOT}/prisma/migrations/${name}"
    if [[ -d "${src}" ]]; then
      rm -rf "${STAGING_DIR}/${name}"
      mv "${src}" "${STAGING_DIR}/${name}"
    fi
  done
}

cleanup() {
  restore_migrations
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
  rm -f "${FIXTURE_IDS}" 2>/dev/null || true
}
trap cleanup EXIT

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

log "Holding VO-2 / VO-2.1 migrations"
hold_migrations

log "Migrate deploy up to pre-VO-2"
DATABASE_URL="${MIGRATION_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

vo2_present="$(psql_atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'vehicle_onboarding_cases';")"
vo2_present="$(echo "${vo2_present}" | tr -d '[:space:]')"
[[ "${vo2_present}" == "0" ]] || fail "vehicle_onboarding_cases must not exist before VO-2"

log "Seed pre-VO-2 legacy fixture"
DATABASE_URL="${MIGRATION_DATABASE_URL}" VO2_FIXTURE_IDS_PATH="${FIXTURE_IDS}" \
  npx ts-node -r tsconfig-paths/register scripts/test/vo2-pre-vo2-fixture.seed.ts

[[ -f "${FIXTURE_IDS}" ]] || fail "fixture IDs file missing"

log "Restore VO-2 migrations and apply VO-2 + VO-2.1"
restore_migrations
DATABASE_URL="${MIGRATION_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

ORG_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).orgId")"
NORMAL_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).vehicleNormalId")"
SYNTH_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).vehicleSyntheticId")"
PLATE_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).vehiclePlateId")"
NO_PLATE_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).vehicleNoPlateId")"
NULL_VIN_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).vehicleNullVin2Id")"
CREATED_AT="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).createdAt")"
DIMO_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).dimoId")"
HM_ID="$(node -pe "JSON.parse(require('fs').readFileSync('${FIXTURE_IDS}','utf8')).hmId")"

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  [[ "${actual}" == "${expected}" ]] || fail "${label}: expected '${expected}', got '${actual}'"
}

log "Post-upgrade assertions"

all_active="$(psql_atc "SELECT COUNT(*) FROM vehicles WHERE registry_lifecycle <> 'ACTIVE';")"
assert_eq "all_registry_lifecycle_active" "$(echo "${all_active}" | tr -d '[:space:]')" "0"

synth_state="$(psql_atc "SELECT vin_verification_state FROM vehicles WHERE id = '${SYNTH_ID}';")"
assert_eq "synthetic_vin_state" "$(echo "${synth_state}" | tr -d '[:space:]')" "LEGACY_SYNTHETIC"

normal_state="$(psql_atc "SELECT vin_verification_state FROM vehicles WHERE id = '${NORMAL_ID}';")"
assert_eq "normal_vin_state" "$(echo "${normal_state}" | tr -d '[:space:]')" "LEGACY_UNKNOWN"

verified_count="$(psql_atc "SELECT COUNT(*) FROM vehicles WHERE vin_verification_state = 'VERIFIED';")"
assert_eq "no_auto_verified" "$(echo "${verified_count}" | tr -d '[:space:]')" "0"

vin_nullable="$(psql_atc "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'vin';")"
assert_eq "vin_nullable" "$(echo "${vin_nullable}" | tr -d '[:space:]')" "YES"

psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -c "UPDATE vehicles SET vin = NULL WHERE id IN ('${NO_PLATE_ID}', '${NULL_VIN_ID}');"
null_vin_count="$(psql_atc "SELECT COUNT(*) FROM vehicles WHERE organization_id = '${ORG_ID}' AND vin IS NULL;")"
assert_eq "multiple_null_vins_same_org" "$(echo "${null_vin_count}" | tr -d '[:space:]')" "2"

assign_count="$(psql_atc "SELECT COUNT(*) FROM vehicle_organization_assignments WHERE vehicle_id = '${NORMAL_ID}';")"
assert_eq "org_assignment_count" "$(echo "${assign_count}" | tr -d '[:space:]')" "1"

assign_from="$(psql_atc "SELECT to_char(valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') FROM vehicle_organization_assignments WHERE vehicle_id = '${NORMAL_ID}' LIMIT 1;")"
expected_from="$(node -pe "new Date('${CREATED_AT}').toISOString().slice(0,19)")"
assert_eq "assignment_valid_from" "$(echo "${assign_from}" | tr -d '[:space:]')" "${expected_from}"

assign_source="$(psql_atc "SELECT assignment_source FROM vehicle_organization_assignments WHERE vehicle_id = '${NORMAL_ID}' LIMIT 1;")"
assert_eq "assignment_source" "$(echo "${assign_source}" | tr -d '[:space:]')" "VO2_MIGRATION_APPROX"

plate_rows="$(psql_atc "SELECT COUNT(*) FROM vehicle_license_plate_assignments WHERE vehicle_id = '${PLATE_ID}';")"
assert_eq "plate_backfill_plated" "$(echo "${plate_rows}" | tr -d '[:space:]')" "1"

no_plate_rows="$(psql_atc "SELECT COUNT(*) FROM vehicle_license_plate_assignments WHERE vehicle_id = '${NO_PLATE_ID}';")"
assert_eq "plate_backfill_empty" "$(echo "${no_plate_rows}" | tr -d '[:space:]')" "0"

dimo_link="$(psql_atc "SELECT COUNT(*) FROM vehicle_data_source_links WHERE vehicle_id = '${NORMAL_ID}' AND dimo_vehicle_id = '${DIMO_ID}' AND is_active = true;")"
assert_eq "dimo_link_preserved" "$(echo "${dimo_link}" | tr -d '[:space:]')" "1"

hm_link="$(psql_atc "SELECT COUNT(*) FROM vehicle_data_source_links WHERE vehicle_id = '${PLATE_ID}' AND source_reference_id = '${HM_ID}' AND is_active = true;")"
assert_eq "hm_link_preserved" "$(echo "${hm_link}" | tr -d '[:space:]')" "1"

dup_open="$(psql_atc "
  SELECT COUNT(*) FROM (
    SELECT vehicle_id FROM vehicle_organization_assignments WHERE valid_to IS NULL GROUP BY vehicle_id HAVING COUNT(*) > 1
  ) x;
")"
assert_eq "no_duplicate_open_org_assignments" "$(echo "${dup_open}" | tr -d '[:space:]')" "0"

legacy_vehicle_count="$(psql_atc "SELECT COUNT(*) FROM vehicles WHERE organization_id = '${ORG_ID}';")"
assert_eq "legacy_vehicles_retained" "$(echo "${legacy_vehicle_count}" | tr -d '[:space:]')" "5"

partial_idx="$(psql_atc "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_vehicle_data_source_link_active_scope';")"
assert_eq "active_link_partial_unique" "$(echo "${partial_idx}" | tr -d '[:space:]')" "1"

log "Legacy upgrade migration test OK"
