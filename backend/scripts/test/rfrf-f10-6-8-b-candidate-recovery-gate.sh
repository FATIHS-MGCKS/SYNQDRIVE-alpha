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

export RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION=1

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts|raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts'

echo "RFRF_F10_6_8_B_CANDIDATE_RECOVERY_PG_MATRIX=PASS"
