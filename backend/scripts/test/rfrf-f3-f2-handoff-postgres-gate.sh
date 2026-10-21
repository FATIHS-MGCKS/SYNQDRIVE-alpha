#!/usr/bin/env bash
# RFRF F3→F2 handoff — isolated localhost PostgreSQL gate (never production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"


BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf-f3-f2-$(date +%s)"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f3_handoff_${GATE_ID//-/_}"
PG_USER="rfrf_f3_handoff_test"
PG_PASS="rfrf_f3_handoff_${GATE_ID}_local"

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}?schema=public"

echo "TEST_POSTGRES_HOST=localhost"
echo "TEST_POSTGRES_PORT=${PG_PORT}"
echo "TEST_POSTGRES_DATABASE=${PG_DB}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"
echo "MIGRATION_MECHANISM=prisma migrate deploy"

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
# Ephemeral test DB may lag schema.prisma on column drift; db push applies columns before index conflicts.
npx prisma db push --accept-data-loss --skip-generate || true

RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1 npm test -- \
  raw-fuel-rise-detector-f2-handoff.postgres.integration.spec.ts \
  --runInBand --verbose --forceExit
