#!/usr/bin/env bash
# RFRF F10.6.8-B — candidate recovery PostgreSQL matrix (isolated localhost PG only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_ID="rfrf_f10_6_8_b_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f10_6_8_b_${GATE_ID//-/_}"
PG_USER="rfrf_f10_6_8_b_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f10_6_8_b_${GATE_ID}_local"

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f10_6_8_b_* ]]; then
    echo "Refusing: database name must match rfrf_f10_6_8_b_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL}" == *"app.synqdrive"* || "${DATABASE_URL}" == *"production"* ]]; then
    echo "Refusing: production-like DATABASE_URL detected" >&2
    exit 1
  fi
}

verify_rfrf_schema() {
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1 FROM "raw_refuel_candidates" LIMIT 0`;
    await prisma.$queryRaw`SELECT "recovery_next_attempt_at" FROM "raw_refuel_candidates" LIMIT 0`;
    await prisma.$queryRaw`SELECT "powertrain_type" FROM "dimo_vehicles" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('RFRF F10.6.8-B schema verification OK');
})().catch((error) => {
  console.error('RFRF F10.6.8-B schema verification failed:', error.message);
  process.exit(1);
});
NODE
}

sync_schema_drift_if_needed() {
  if verify_rfrf_schema 2>/dev/null; then
    echo "TEST_SCHEMA_DRIFT_SYNC=NONE"
    return 0
  fi

  echo "TEST_SCHEMA_DRIFT_SYNC=DB_PUSH_TEST_ONLY"
  local log
  log="$(mktemp /tmp/rfrf-f10-6-8-b-dbpush.XXXXXX.log)"
  set +e
  npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee "$log"
  local db_push_exit=${PIPESTATUS[0]}
  set -e

  if verify_rfrf_schema; then
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

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

echo "TEST_POSTGRES_HOST=${PG_HOST}"
echo "TEST_POSTGRES_PORT=${PG_PORT}"
echo "TEST_POSTGRES_DATABASE=${PG_DB}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"

cd "${BACKEND_ROOT}"
npx prisma generate

PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
sync_schema_drift_if_needed

export RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION=1

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts|raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts'

echo "RFRF_F10_6_8_B_CANDIDATE_RECOVERY_PG_MATRIX=PASS"
