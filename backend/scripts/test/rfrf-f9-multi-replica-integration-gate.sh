#!/usr/bin/env bash
# RFRF F9 — independent-replica PostgreSQL + Redis integration closure gate.
# Orchestrates net-new F9 proofs plus authoritative prior-phase regressions (no runtime changes).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
GATE_ID="rfrf_f9_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
REDIS_PORT="${TEST_REDIS_PORT:-56379}"
PG_DB="rfrf_f9_${GATE_ID//-/_}"
PG_USER="rfrf_f9_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f9_${GATE_ID}_local"
REDIS_STARTED=0

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f9_* ]]; then
    echo "Refusing: database name must match rfrf_f9_* (got ${PG_DB})" >&2
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
    await prisma.$queryRaw`SELECT "lifecycle_state"::text FROM "raw_refuel_candidates" LIMIT 0`;
    await prisma.$queryRaw`SELECT "detection_source" FROM "vehicle_energy_events" LIMIT 0`;
    await prisma.$queryRaw`SELECT "source_event_key" FROM "vehicle_energy_events" LIMIT 0`;
    await prisma.$queryRaw`SELECT "powertrain_type" FROM "dimo_vehicles" LIMIT 0`;
    await prisma.$queryRaw`SELECT 1 FROM "vehicle_energy_event_refuel_reconciliations" LIMIT 0`;
  } finally {
    await prisma.$disconnect();
  }
  console.log('RFRF F9 schema verification OK');
})().catch((error) => {
  console.error('RFRF F9 schema verification failed:', error.message);
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
  log="$(mktemp /tmp/rfrf-f9-dbpush.XXXXXX.log)"
  set +e
  npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee "$log"
  local db_push_exit=${PIPESTATUS[0]}
  set -e

  if verify_rfrf_schema; then
    if [[ "$db_push_exit" -ne 0 ]]; then
      if grep -Eq 'already exists|duplicate' "$log"; then
        echo "TEST_SCHEMA_DRIFT_SYNC_NOTE=db_push exit=${db_push_exit} with duplicate-object noise; schema resolved"
      else
        echo "db push failed and schema verification still failing (exit=${db_push_exit})" >&2
        cat "$log" >&2
        exit "$db_push_exit"
      fi
    fi
    return 0
  fi

  echo "schema drift unresolved after db push (exit=${db_push_exit})" >&2
  cat "$log" >&2
  exit 1
}

cleanup() {
  if [[ "${REDIS_STARTED}" == "1" ]]; then
    redis-cli -p "${REDIS_PORT}" shutdown nosave 2>/dev/null || true
  fi
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS ${PG_DB};\"" 2>/dev/null || true
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"DROP ROLE IF EXISTS ${PG_USER};\"" 2>/dev/null || true
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

echo "==> F9 gate: isolated PostgreSQL on ${PG_HOST}:${PG_PORT}/${PG_DB}"
su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';\""
su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER};\""

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

echo "==> F9 gate: isolated Redis on 127.0.0.1:${REDIS_PORT}"
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
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
sync_schema_drift_if_needed

echo "==> F9-P1..P6 + P10: independent-replica integration"
export RAW_FUEL_REFUEL_F9_INTEGRATION=1
export RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED=1
export RAW_FUEL_REFUEL_F9_REDIS_REQUIRED=1
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f9-multi-replica.postgres.integration.spec.ts

echo "==> F9-P7: existing multi-replica recovery regression (reference, not duplicated)"
export PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern=physical-refuel-multi-replica-recovery.postgres-redis.integration.spec.ts

echo "==> F9-P8: F5-PR2 atomic promotion regression"
export RAW_FUEL_REFUEL_F5_PR2_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f5-pr2-promotion.postgres.integration.spec.ts

echo "==> F9-P9: F5-PR3.1 post-commit G2 handoff regression"
export RAW_FUEL_REFUEL_F5_PR3_INTEGRATION=1
export RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED=1
export RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f5-pr3-g2-handoff.postgres.integration.spec.ts

echo "==> F7 recovery completeness regression"
export RAW_FUEL_REFUEL_F7_INTEGRATION=1
export RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED=1
npm test -- --runInBand --forceExit \
  --testPathPattern='raw-fuel-refuel-fallback-f7-recovery.postgres.integration.spec.ts|physical-refuel-reconciliation-recovery.scheduler.spec.ts'

echo "==> F6 G2 payload compatibility regression"
export RAW_FUEL_REFUEL_F6_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f6-g2-payload.postgres.integration.spec.ts

echo "==> F5-PR1 convergence regression"
export RAW_FUEL_REFUEL_F5_PR1_INTEGRATION=1
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f5-pr1-convergence.postgres.integration.spec.ts

echo "==> F8 operational telemetry regression"
export RAW_FUEL_REFUEL_F8_INTEGRATION=1
export RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED=1
npm test -- --runInBand --forceExit \
  --testPathPattern='physical-refuel-f8-observability.postgres.integration.spec.ts|physical-refuel-reconciliation-metrics.service.spec.ts|physical-refuel-recovery.lost-enqueue-count.spec.ts'

echo "==> G2.1b/c/d semantic recovery regression"
npm test -- --runInBand --forceExit \
  --testPathPattern=physical-refuel-g21d-final-recovery-execution-closure.spec.ts

echo "==> RFRF metrics regression"
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-metrics.service.spec.ts

echo "==> Backend build"
npm run build

echo "==> Prisma validate"
npx prisma validate

echo "==> EED graph validator"
node "${REPO_ROOT}/architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs"

echo "==> Module registry validator"
bash "${REPO_ROOT}/architecture/scripts/validate-module-registry.sh"

echo "==> git diff --check"
cd "${REPO_ROOT}"
git diff --check

echo "RFRF F9 multi-replica integration gate PASS"
