#!/usr/bin/env bash
# RFRF F3→F2 handoff — isolated localhost PostgreSQL gate (never production).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf-f3-f2-$(date +%s)"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f3_handoff_${GATE_ID//-/_}"
PG_USER="rfrf_f3_handoff_test"
PG_PASS="rfrf_f3_handoff_${GATE_ID}_local"

cleanup() {
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS ${PG_DB};\"" 2>/dev/null || true
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP ROLE IF EXISTS ${PG_USER};\"" 2>/dev/null || true
}
trap cleanup EXIT

su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';\""
su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER};\""

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}?schema=public"

echo "TEST_POSTGRES_HOST=localhost"
echo "TEST_POSTGRES_PORT=${PG_PORT}"
echo "TEST_POSTGRES_DATABASE=${PG_DB}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"
echo "MIGRATION_MECHANISM=prisma migrate deploy"

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1 npm test -- \
  raw-fuel-rise-detector-f2-handoff.postgres.integration.spec.ts \
  --runInBand --verbose --forceExit
