#!/usr/bin/env bash
# RFRF F7.1 — multi-replica physical-refuel recovery (isolated localhost PostgreSQL + Redis).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"


BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf_f7_mr_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
REDIS_PORT="${TEST_REDIS_PORT:-56379}"
PG_DB="rfrf_f7_mr_${GATE_ID//-/_}"
PG_USER="rfrf_f7_mr_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f7_mr_${GATE_ID}_local"
REDIS_STARTED=0

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f7_mr_* ]]; then
    echo "Refusing: database name must match rfrf_f7_mr_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL}" == *"app.synqdrive"* || "${DATABASE_URL}" == *"production"* ]]; then
    echo "Refusing: production-like DATABASE_URL detected" >&2
    exit 1
  fi
}

cleanup() {
  if [[ "${REDIS_STARTED}" == "1" ]]; then
    redis-cli -p "${REDIS_PORT}" shutdown nosave 2>/dev/null || true
  fi
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

export TEST_POSTGRES_HOST="${PG_HOST}"
export TEST_POSTGRES_PORT="${PG_PORT}"
export TEST_POSTGRES_DATABASE="${PG_DB}"
export TEST_REDIS_HOST="127.0.0.1"
export TEST_REDIS_PORT="${REDIS_PORT}"
export G21D_FINAL_POSTGRES_DATABASE="${PG_DB}"
export G21D_FINAL_POSTGRES_USER="${PG_USER}"
export G21D_FINAL_POSTGRES_PASSWORD="${PG_PASS}"
export G21D_FINAL_REDIS_PORT="${REDIS_PORT}"
export G21D_FINAL_REDIS_DB="14"

echo "TEST_POSTGRES_HOST=${TEST_POSTGRES_HOST}"
echo "TEST_POSTGRES_PORT=${TEST_POSTGRES_PORT}"
echo "TEST_POSTGRES_DATABASE=${TEST_POSTGRES_DATABASE}"
echo "TEST_REDIS_HOST=${TEST_REDIS_HOST}"
echo "TEST_REDIS_PORT=${TEST_REDIS_PORT}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"
echo "TEST_REDIS_IS_PRODUCTION=NO"

echo "==> Creating isolated PostgreSQL database on localhost:${PG_PORT}"
rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

echo "==> Starting isolated Redis on localhost:${REDIS_PORT}"
redis-server \
  --port "${REDIS_PORT}" \
  --bind 127.0.0.1 \
  --save "" \
  --appendonly no \
  --daemonize yes \
  --databases 16

for _ in $(seq 1 30); do
  if redis-cli -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
done
redis-cli -p "${REDIS_PORT}" ping
REDIS_STARTED=1

cd "${BACKEND_ROOT}"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

export PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern=physical-refuel-multi-replica-recovery.postgres-redis.integration.spec.ts

echo "RFRF F7 multi-replica gate PASS"
