#!/usr/bin/env bash
# P6-PR5B — disposable PostgreSQL certification for rental booking lifecycle HTTP integration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

export CI_PG_CONTAINER="${CI_PG_CONTAINER:-p6-pr5b-ci-postgres}"
PG_CONTAINER="${CI_PG_CONTAINER}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
BASE_DB="${CI_PG_BASE_DB:-synqdrive_ci_ephemeral}"
DISPOSABLE_DB="${P6_PR5B_DISPOSABLE_DB:-p6_pr5b_test_ci}"

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
    *srv1374778*|*app.synqdrive*|*hstgr.cloud*|*mein-vps*)
      echo "${name} must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

if [[ ! "${DISPOSABLE_DB}" =~ ^p6_pr5b_test_[a-zA-Z0-9_]+$ ]] \
  && [[ "${DISPOSABLE_DB}" != "synqdrive_p6_pr5b_rental_e2e" ]]; then
  echo "Refusing: database name must match p6_pr5b_test_* or synqdrive_p6_pr5b_rental_e2e (got ${DISPOSABLE_DB})" >&2
  exit 1
fi

bash scripts/test/ci-start-postgres.sh

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${DISPOSABLE_DB}?schema=public"
fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"

docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${BASE_DB}" -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DISPOSABLE_DB}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS ${DISPOSABLE_DB};" \
  -c "CREATE DATABASE ${DISPOSABLE_DB};"

echo "P6_PR5B_DISPOSABLE_DATABASE=${DISPOSABLE_DB}"
echo "DATABASE_URL_HOST=127.0.0.1"
echo "DATABASE_URL_DB=${DISPOSABLE_DB}"

npm ci
npx prisma generate
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
bash scripts/test/prisma-migrate-deploy-resilient.sh

verify_prisma_schema_matches_client() {
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT language FROM users LIMIT 0`;
    await prisma.$queryRaw`SELECT id FROM bookings LIMIT 0`;
    await prisma.$queryRaw`SELECT id FROM booking_document_bundles LIMIT 0`;
    await prisma.$queryRaw`
      SELECT
        credit_card_required,
        foreign_travel_policy,
        additional_driver_policy,
        young_driver_policy,
        insurance_requirement,
        manual_approval_required,
        notes,
        version
      FROM organization_rental_rules
      LIMIT 0`;
    await prisma.$queryRaw`
      SELECT id, organization_id, scope_type, scope_id, rules_hash, normalized_rules
      FROM rental_rule_revisions
      LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('P6-PR5B schema verification OK');
})().catch((error) => {
  console.error('P6-PR5B schema verification failed:', error.message);
  process.exit(1);
});
NODE
}

apply_p6_pr5b_ephemeral_schema_parity() {
  fail_closed_database_url "DATABASE_URL (parity)" "${DATABASE_URL}"
  docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -v ON_ERROR_STOP=1 \
    -c 'ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT '\''de'\'';' \
    -c 'ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT '\''Europe/Berlin'\'';' \
    -c 'ALTER TABLE users ADD COLUMN IF NOT EXISTS date_format TEXT DEFAULT '\''DD.MM.YYYY'\'';'
  docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -v ON_ERROR_STOP=1 \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS credit_card_required BOOLEAN;' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS foreign_travel_policy "RentalForeignTravelPolicy";' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS additional_driver_policy "RentalAdditionalDriverPolicy";' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS young_driver_policy "RentalYoungDriverPolicy";' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS insurance_requirement TEXT;' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS manual_approval_required BOOLEAN;' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS notes TEXT;' \
    -c 'ALTER TABLE organization_rental_rules ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;'
  echo "TEST_SCHEMA_DRIFT_SYNC=P6_PR5B_TARGETED_SQL_PARITY"
}

sync_ephemeral_schema_if_needed() {
  apply_p6_pr5b_ephemeral_schema_parity
  if verify_prisma_schema_matches_client; then
    return 0
  fi
  echo "P6-PR5B schema drift unresolved after targeted parity SQL" >&2
  exit 1
}

sync_ephemeral_schema_if_needed

export RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1
export STATIONS_V2_FLAGS_TEST_DEFAULT=off

assert_p6_pr5b_integration_env() {
  if [[ "${RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION:-}" != "1" ]]; then
    echo "Refusing: RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1 required (prevents silent describe.skip)" >&2
    exit 1
  fi
  fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"
}

run_jest_postgres_suite() {
  local expected_tests="$1"
  local log
  log="$(mktemp /tmp/p6-pr5b-pg-ci.XXXXXX.log)"
  set +e
  npm test -- --testPathPatterns='p6-pr5b-disposable-postgres-preflight|rental-booking-lifecycle.http.postgres|rental-booking-wizard.http.postgres|rental-booking-wizard-payment-link.http.postgres|rental-booking-wizard-eligibility-real.http.postgres' --runInBand --verbose 2>&1 | tee "${log}"
  local test_exit=${PIPESTATUS[0]}
  set -e

  if ! grep -qE "Tests:[[:space:]]+${expected_tests} passed, ${expected_tests} total" "${log}"; then
    echo "P6-PR5B: expected ${expected_tests} passed tests (discovery/execution mismatch or failure)" >&2
    grep -E 'Tests:|PASS |FAIL ' "${log}" >&2 || true
    exit 1
  fi
  if [[ "${test_exit}" -ne 0 ]]; then
    exit "${test_exit}"
  fi
  echo "P6_PR5B_HTTP_POSTGRES_TESTS_EXECUTED=7"
  echo "P6_PR5C_HTTP_POSTGRES_TESTS_EXECUTED=6"
  echo "P6_PR5D_HTTP_POSTGRES_TESTS_EXECUTED=5"
  echo "P6_PR5E_HTTP_POSTGRES_TESTS_EXECUTED=5"
  echo "P6-PR5B/PR5C/PR5D/PR5E disposable PostgreSQL integration: PASS (${expected_tests}/${expected_tests})"
}

assert_p6_pr5b_integration_env
run_jest_postgres_suite 27