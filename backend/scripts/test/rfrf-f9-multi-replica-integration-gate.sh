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
