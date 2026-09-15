#!/usr/bin/env bash
# RFRF F8 — operational telemetry + Prometheus alerting closure (isolated localhost PostgreSQL).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf_f8_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f8_${GATE_ID//-/_}"
PG_USER="rfrf_f8_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f8_${GATE_ID}_local"

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f8_* ]]; then
    echo "Refusing: database name must match rfrf_f8_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL}" == *"app.synqdrive"* || "${DATABASE_URL}" == *"production"* ]]; then
    echo "Refusing: production-like DATABASE_URL detected" >&2
    exit 1
  fi
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
npx prisma db push --accept-data-loss --skip-generate >/dev/null

export RAW_FUEL_REFUEL_F8_INTEGRATION=1
export RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED=1

npm test -- --runInBand --forceExit \
  --testPathPattern='physical-refuel-f8-observability.postgres.integration.spec.ts|physical-refuel-reconciliation-metrics.service.spec.ts|physical-refuel-recovery.lost-enqueue-count.spec.ts'

echo "RFRF F8 operational telemetry gate PASS"
