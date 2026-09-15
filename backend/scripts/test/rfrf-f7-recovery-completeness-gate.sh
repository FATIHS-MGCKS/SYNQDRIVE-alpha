#!/usr/bin/env bash
# RFRF F7 — recovery completeness + post-commit crash-window closure gate (isolated localhost PostgreSQL).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf_f7_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f7_${GATE_ID//-/_}"
PG_USER="rfrf_f7_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f7_${GATE_ID}_local"

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f7_* ]]; then
    echo "Refusing: database name must match rfrf_f7_* (got ${PG_DB})" >&2
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
    await prisma.$queryRaw`SELECT "detection_source" FROM "vehicle_energy_events" LIMIT 0`;
    await prisma.$queryRaw`SELECT "source_event_key" FROM "vehicle_energy_events" LIMIT 0`;
    await prisma.$queryRaw`SELECT 1 FROM "vehicle_energy_event_refuel_reconciliations" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('RFRF F7 schema verification OK');
})().catch((error) => {
  console.error('RFRF F7 schema verification failed:', error.message);
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
  log="$(mktemp /tmp/rfrf-f7-dbpush.XXXXXX.log)"
  set +e
  npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee "$log"
  local db_push_exit=${PIPESTATUS[0]}
  set -e

  if verify_rfrf_schema; then
    return 0
  fi

  echo "schema drift unresolved after db push (exit=${db_push_exit})" >&2
  cat "$log" >&2
  exit 1
}

cleanup() {
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS ${PG_DB};\"" 2>/dev/null || true
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP ROLE IF EXISTS ${PG_USER};\"" 2>/dev/null || true
}
trap cleanup EXIT

su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';\""
su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER};\""

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

echo "TEST_POSTGRES_HOST=${PG_HOST}"
echo "TEST_POSTGRES_PORT=${PG_PORT}"
echo "TEST_POSTGRES_DATABASE=${PG_DB}"

cd "${BACKEND_ROOT}"
sync_schema_drift_if_needed

export RAW_FUEL_REFUEL_F7_INTEGRATION=1
export RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED=1

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-fuel-refuel-fallback-f7-recovery.postgres.integration.spec.ts|physical-refuel-reconciliation-recovery.scheduler.spec.ts'

echo "RFRF F7 gate PASS"
