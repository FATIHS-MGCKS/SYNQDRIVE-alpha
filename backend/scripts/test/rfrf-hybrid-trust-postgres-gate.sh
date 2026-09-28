#!/usr/bin/env bash
# RFRF hybrid absolute signal trust — isolated localhost PostgreSQL gate (fail-closed).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_ID="rfrf_hybrid_trust_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_hybrid_trust_${GATE_ID//-/_}"
PG_USER="rfrf_hybrid_trust_${GATE_ID//-/_}_u"
PG_PASS="rfrf_hybrid_trust_${GATE_ID}_local"

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_hybrid_trust_* ]]; then
    echo "Refusing: database name must match rfrf_hybrid_trust_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"production"* ]]; then
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
    await prisma.$queryRaw`SELECT "powertrain_type" FROM "dimo_vehicles" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('RFRF hybrid trust schema verification OK');
})().catch((error) => {
  console.error('RFRF hybrid trust schema verification failed:', error.message);
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
  npx prisma db push --accept-data-loss --skip-generate
  verify_rfrf_schema
}

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}

if [[ "${RFRF_HYBRID_TRUST_GATE_SELFTEST:-}" != "1" ]]; then
  export RFRF_HYBRID_TRUST_GATE_SELFTEST=1
  export DATABASE_URL="postgresql://u:p@app.synqdrive.eu/synqdrive?schema=public"
  set +e
  assert_test_db_isolation >/dev/null 2>&1
  reject_exit=$?
  set -e
  if [[ "${reject_exit}" -eq 0 ]]; then
    echo "RFRF hybrid trust gate self-test FAILED: production-like DATABASE_URL was accepted" >&2
    exit 1
  fi
  unset DATABASE_URL
  echo "RFRF_HYBRID_TRUST_GATE_PRODUCTION_URL_REJECT=PASS"
fi

trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
sync_schema_drift_if_needed

export RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1

npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-hybrid-trust.postgres.integration.spec.ts

echo "RFRF_HYBRID_TRUST_POSTGRES_GATE=PASS"
