#!/usr/bin/env bash
# RFRF F10.6.8-C — recovery-owned Stage-5 promotion liveness (PostgreSQL).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_ID="rfrf_f10_6_8_c_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f10_6_8_c_${GATE_ID//-/_}"
PG_USER="rfrf_f10_6_8_c_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f10_6_8_c_${GATE_ID}_local"

verify_rfrf_schema() {
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT "powertrain_type" FROM "dimo_vehicles" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('RFRF full test schema verification OK (unrelated drift probe)');
})().catch((error) => {
  console.error('RFRF full test schema verification failed:', error.message);
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
  log="$(mktemp /tmp/rfrf-f10-6-8-c-dbpush.XXXXXX.log)"
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

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
export RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_C_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-c.postgres.integration.spec.ts'

echo "F10_6_8_C_RECOVERY_PROMOTION_GATE=PASS"
