#!/usr/bin/env bash
# RFRF F5-PR3 / F5-PR3.1 post-commit G2 handoff gate — isolated localhost PostgreSQL + Redis only.
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rfrf_f5_pr3_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
REDIS_HOST="${TEST_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${TEST_REDIS_PORT:-56379}"
PG_DB="rfrf_f5_pr3_${GATE_ID//-/_}"
PG_USER="rfrf_f5_pr3_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f5_pr3_${GATE_ID}_local"
DOCKER_CMD="${DOCKER_CMD:-docker}"
REDIS_CONTAINER="rfrf-f5-pr3-redis-${GATE_ID}"
STARTED_REDIS_CONTAINER=0

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f5_pr3_* ]]; then
    echo "Refusing: database name must match rfrf_f5_pr3_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL}" == *"app.synqdrive"* || "${DATABASE_URL}" == *"production"* ]]; then
    echo "Refusing: production-like DATABASE_URL detected" >&2
    exit 1
  fi
}

assert_test_redis_isolation() {
  case "${REDIS_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_REDIS_HOST must be localhost or 127.0.0.1 (got ${REDIS_HOST})" >&2
      exit 1
      ;;
  esac
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
  console.log('RFRF F5-PR3 schema verification OK');
})().catch((error) => {
  console.error('RFRF F5-PR3 schema verification failed:', error.message);
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
  log="$(mktemp /tmp/rfrf-f5-pr3-dbpush.XXXXXX.log)"
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

start_isolated_redis_if_needed() {
  if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
    echo "TEST_REDIS_READY=EXISTING"
    return 0
  fi

  if command -v redis-server >/dev/null 2>&1; then
    echo "==> Starting local redis-server on ${REDIS_HOST}:${REDIS_PORT}"
    redis-server --port "${REDIS_PORT}" --bind "${REDIS_HOST}" --daemonize yes --save "" >/dev/null 2>&1 || true
    for _ in $(seq 1 15); do
      if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
        echo "TEST_REDIS_READY=LOCAL"
        return 0
      fi
      sleep 1
    done
  fi

  if ! command -v "${DOCKER_CMD}" >/dev/null 2>&1; then
    echo "Refusing: RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1 but Redis is unavailable" >&2
    exit 1
  fi

  echo "==> Starting isolated Redis 7 on ${REDIS_HOST}:${REDIS_PORT}"
  ${DOCKER_CMD} run -d --name "${REDIS_CONTAINER}" \
    -p "127.0.0.1:${REDIS_PORT}:6379" \
    redis:7
  STARTED_REDIS_CONTAINER=1

  for _ in $(seq 1 30); do
    if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
      echo "TEST_REDIS_READY=DOCKER"
      return 0
    fi
    sleep 1
  done

  echo "Redis failed to become ready on ${REDIS_HOST}:${REDIS_PORT}" >&2
  exit 1
}

cleanup() {
  if [[ "${STARTED_REDIS_CONTAINER}" == "1" ]]; then
    ${DOCKER_CMD} rm -f "${REDIS_CONTAINER}" 2>/dev/null || true
  fi
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

export RAW_FUEL_REFUEL_F5_PR3_INTEGRATION=1
export RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED=1
export RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1
export TEST_REDIS_HOST="${REDIS_HOST}"
export TEST_REDIS_PORT="${REDIS_PORT}"
export G21D_FINAL_REDIS_HOST="${REDIS_HOST}"
export G21D_FINAL_REDIS_PORT="${REDIS_PORT}"
export G21D_FINAL_REDIS_DB="14"
assert_test_redis_isolation
start_isolated_redis_if_needed

echo "TEST_REDIS_HOST=${REDIS_HOST}"
echo "TEST_REDIS_PORT=${REDIS_PORT}"
echo "TEST_REDIS_IS_PRODUCTION=NO"

npm test -- --runInBand --forceExit --testPathPattern=raw-fuel-refuel-fallback-f5-pr3-g2-handoff.postgres.integration.spec.ts

echo "RFRF F5-PR3.1 gate PASS"
