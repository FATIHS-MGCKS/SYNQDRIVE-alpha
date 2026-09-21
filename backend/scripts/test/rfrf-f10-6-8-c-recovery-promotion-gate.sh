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

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"

cd "${BACKEND_ROOT}"
npx prisma migrate deploy
export RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_C_INTEGRATION=1
npx jest --config jest.config.ts \
  src/modules/vehicle-intelligence/energy-events/raw-refuel-candidate/raw-refuel-candidate-recovery-f10-6-8-c.postgres.integration.spec.ts \
  --runInBand --forceExit

echo "F10_6_8_C_RECOVERY_PROMOTION_GATE=PASS"
