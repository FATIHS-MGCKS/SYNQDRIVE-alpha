#!/usr/bin/env bash
# Disposable PostgreSQL certification for DTC-01B/01C snapshot apply integration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

export CI_PG_CONTAINER="${CI_PG_CONTAINER:-dtc01b-ci-postgres}"
PG_CONTAINER="${CI_PG_CONTAINER}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
BASE_DB="${CI_PG_BASE_DB:-synqdrive_ci_ephemeral}"
DISPOSABLE_DB="${DTC01B_DISPOSABLE_DB:-dtc01b_test_ci}"

fail_closed_database_url() {
  local name="$1" url="$2"
  local lower="${url,,}"
  case "$lower" in
    *127.0.0.1*|*localhost*|*@postgres:*) ;;
    *)
      echo "${name} must target ephemeral local PostgreSQL (127.0.0.1, localhost, or CI service host postgres)" >&2
      exit 1
      ;;
  esac
  case "$lower" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*|*synqdrive.eu*)
      echo "${name} must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

assert_disposable_database_name() {
  local db_name="$1"
  if [[ ! "${db_name}" =~ ^dtc01b_test_[a-zA-Z0-9_]+$ ]]; then
    echo "Refusing: database name must match dtc01b_test_* (got ${db_name})" >&2
    exit 1
  fi
  local db_lower="${db_name,,}"
  case "${db_lower}" in
    synqdrive | production | prod | app | postgres | template0 | template1)
      echo "Refusing: production-like database name (${db_name})" >&2
      exit 1
      ;;
  esac
}

assert_disposable_database_name "${DISPOSABLE_DB}"

bash scripts/test/ci-start-postgres.sh

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${DISPOSABLE_DB}?schema=public"
fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"

docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${BASE_DB}" -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DISPOSABLE_DB}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS ${DISPOSABLE_DB};" \
  -c "CREATE DATABASE ${DISPOSABLE_DB};"

echo "DTC01B_DISPOSABLE_DATABASE=${DISPOSABLE_DB}"
echo "DATABASE_URL=${DATABASE_URL}"

npm ci
npx prisma generate
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
bash scripts/test/prisma-migrate-deploy-resilient.sh

for mig in 20261015180000_vehicle_dtc_source_head_01b 20261015193000_vehicle_dtc_source_head_01c_partial; do
  applied_count="$(docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -tAc \
    "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name = '${mig}' AND finished_at IS NOT NULL;")"
  applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
  if [[ "${applied_count}" != "1" ]]; then
    echo "Expected applied migration ${mig}, got count=${applied_count}" >&2
    exit 1
  fi
done

# Ephemeral disposable DB: apply targeted parity for columns present in schema.prisma but absent from the
# migration chain (VO/RFRF precedent). Avoid full `prisma db push` when possible — db push can emit invalid
# SQL (e.g. RenamePrimaryKey batches) on large drift surfaces.
apply_ephemeral_schema_parity() {
  fail_closed_database_url "DATABASE_URL (parity)" "${DATABASE_URL}"
  assert_disposable_database_name "${DISPOSABLE_DB}"
  local parity_sql="${ROOT}/scripts/test/sql/ensure-ephemeral-prisma-schema-parity.sql"
  if [[ ! -f "${parity_sql}" ]]; then
    echo "missing parity SQL: ${parity_sql}" >&2
    exit 1
  fi
  docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -v ON_ERROR_STOP=1 \
    < "${parity_sql}"
  echo "TEST_SCHEMA_DRIFT_SYNC=TARGETED_SQL_PARITY"
}

verify_dtc01b_prisma_schema() {
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT "powertrain_type" FROM "dimo_vehicles" LIMIT 0`;
    await prisma.$queryRaw`SELECT "traction_battery_power_kw" FROM "vehicle_latest_states" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('DTC-01B schema verification OK');
})().catch((error) => {
  console.error('DTC-01B schema verification failed:', error.message);
  process.exit(1);
});
NODE
}

sync_schema_drift_if_needed() {
  apply_ephemeral_schema_parity
  if verify_dtc01b_prisma_schema 2>/dev/null; then
    return 0
  fi

  echo "TEST_SCHEMA_DRIFT_SYNC=DB_PUSH_FALLBACK"
  local log
  log="$(mktemp /tmp/dtc01b-dbpush.XXXXXX.log)"
  set +e
  npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee "$log"
  local db_push_exit=${PIPESTATUS[0]}
  set -e

  if verify_dtc01b_prisma_schema; then
    if [[ "$db_push_exit" -ne 0 ]]; then
      if grep -Eq 'already exists|duplicate' "$log"; then
        echo "TEST_SCHEMA_DRIFT_SYNC_NOTE=db_push exit=${db_push_exit} with duplicate-object noise; schema resolved"
      else
        echo "db push failed and schema verification still failing (exit=${db_push_exit})" >&2
        cat "$log" >&2
        exit "$db_push_exit"
      fi
    fi
    return 0
  fi

  echo "schema drift unresolved after db push (exit=${db_push_exit})" >&2
  cat "$log" >&2
  exit 1
}

sync_schema_drift_if_needed

assert_dtc_disposable_pg_ci_env() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Refusing: DATABASE_URL is required for disposable PostgreSQL certification" >&2
    exit 1
  fi
  fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"
  if [[ "${DTC_01B_PG_INTEGRATION:-}" != "1" ]]; then
    echo "Refusing: DTC_01B_PG_INTEGRATION=1 is required (prevents silent describe.skip)" >&2
    exit 1
  fi
}

run_jest_postgres_suite() {
  local label="$1"
  local pattern="$2"
  local expected_tests="$3"

  local listed
  listed="$(npx jest --listTests --testPathPatterns="${pattern}" 2>/dev/null | wc -l | tr -d '[:space:]')"
  if [[ "${listed}" -lt 1 ]]; then
    echo "${label}: zero test files discovered (pattern=${pattern})" >&2
    exit 1
  fi

  local log
  log="$(mktemp /tmp/dtc-pg-ci.XXXXXX.log)"
  set +e
  npm test -- --testPathPatterns="${pattern}" --runInBand --verbose 2>&1 | tee "${log}"
  local test_exit=${PIPESTATUS[0]}
  set -e

  if ! grep -qE "Tests:[[:space:]]+${expected_tests} passed, ${expected_tests} total" "${log}"; then
    echo "${label}: expected ${expected_tests} passed tests (discovery/execution mismatch or failure)" >&2
    grep -E 'Tests:|PASS |FAIL ' "${log}" >&2 || true
    exit 1
  fi
  if [[ "${test_exit}" -ne 0 ]]; then
    exit "${test_exit}"
  fi
  echo "${label}: PASS (${expected_tests}/${expected_tests})"
}

export DTC_01B_PG_INTEGRATION=1
assert_dtc_disposable_pg_ci_env

run_jest_postgres_suite \
  "DTC-01B PostgreSQL integration" \
  "dtc-01b.postgres.integration.spec" \
  "8"

run_jest_postgres_suite \
  "DTC-02 P4 PostgreSQL integration" \
  "dtc-02-p4.postgres.integration.spec" \
  "4"

echo "DTC disposable PostgreSQL certification (01B + P4): PASS"
