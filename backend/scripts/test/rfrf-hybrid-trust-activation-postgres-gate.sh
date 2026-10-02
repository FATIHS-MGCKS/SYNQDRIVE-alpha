#!/usr/bin/env bash
# RFRF hybrid trust scoped activation — isolated PostgreSQL gate (Alpha allowlist).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_ID="rfrf_hybrid_activation_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_hybrid_activation_${GATE_ID//-/_}"
PG_USER="rfrf_hybrid_activation_${GATE_ID//-/_}_u"
PG_PASS="rfrf_hybrid_activation_${GATE_ID}_local"

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
  console.log('RFRF activation schema verification OK');
})().catch((error) => {
  console.error('RFRF activation schema verification failed:', error.message);
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
  npx prisma db push --accept-data-loss --skip-generate || true
  verify_rfrf_schema
}

sync_schema_drift_if_needed

export RAW_REFUEL_HYBRID_TRUST_ACTIVATION_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern='raw-fuel-hybrid-trust-activation.postgres.integration.spec.ts'

echo "RFRF_HYBRID_TRUST_ACTIVATION_POSTGRES_GATE=PASS"
