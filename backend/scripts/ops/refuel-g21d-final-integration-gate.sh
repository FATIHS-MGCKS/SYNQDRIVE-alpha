#!/usr/bin/env bash
# DI-EV G2.1d-FINAL — isolated Postgres + Redis integration gate (non-production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GATE_ID="refuel-g21d-$(date +%s)"
DOCKER_CMD="${DOCKER_CMD:-docker}"
PG_PORT="${TEST_POSTGRES_PORT:-55432}"
REDIS_PORT="${TEST_REDIS_PORT:-56379}"
PG_DB="refuel_gate_${GATE_ID//-/_}"
PG_USER="refuel_gate"
PG_PASS="refuel_gate_${GATE_ID}_local"
PG_CONTAINER="refuel-gate-pg-${GATE_ID}"
REDIS_CONTAINER="refuel-gate-redis-${GATE_ID}"

export TEST_POSTGRES_HOST="127.0.0.1"
export TEST_POSTGRES_PORT="${PG_PORT}"
export TEST_POSTGRES_DATABASE="${PG_DB}"
export TEST_REDIS_HOST="127.0.0.1"
export TEST_REDIS_PORT="${REDIS_PORT}"

echo "TEST_POSTGRES_HOST=${TEST_POSTGRES_HOST}"
echo "TEST_POSTGRES_PORT=${TEST_POSTGRES_PORT}"
echo "TEST_POSTGRES_DATABASE=${TEST_POSTGRES_DATABASE}"
echo "TEST_REDIS_HOST=${TEST_REDIS_HOST}"
echo "TEST_REDIS_PORT=${TEST_REDIS_PORT}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"
echo "TEST_REDIS_IS_PRODUCTION=NO"

cleanup() {
  ${DOCKER_CMD} rm -f "${PG_CONTAINER}" "${REDIS_CONTAINER}" 2>/dev/null || true
  ${DOCKER_CMD} volume rm "refuel-gate-pg-vol-${GATE_ID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Starting isolated PostgreSQL 16 on localhost:${PG_PORT}"
${DOCKER_CMD} run -d --name "${PG_CONTAINER}" \
  -e POSTGRES_USER="${PG_USER}" \
  -e POSTGRES_PASSWORD="${PG_PASS}" \
  -e POSTGRES_DB="${PG_DB}" \
  -p "127.0.0.1:${PG_PORT}:5432" \
  -v "refuel-gate-pg-vol-${GATE_ID}:/var/lib/postgresql/data" \
  postgres:16

echo "==> Starting isolated Redis 7 on localhost:${REDIS_PORT}"
${DOCKER_CMD} run -d --name "${REDIS_CONTAINER}" \
  -p "127.0.0.1:${REDIS_PORT}:6379" \
  redis:7

echo "==> Waiting for PostgreSQL readiness"
for i in $(seq 1 60); do
  if ${DOCKER_CMD} exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
${DOCKER_CMD} exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}"

echo "==> Waiting for Redis readiness"
for i in $(seq 1 30); do
  if ${DOCKER_CMD} exec "${REDIS_CONTAINER}" redis-cli ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
done

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${TEST_POSTGRES_HOST}:${TEST_POSTGRES_PORT}/${PG_DB}?schema=public"
export REDIS_HOST="${TEST_REDIS_HOST}"
export REDIS_PORT="${TEST_REDIS_PORT}"
export REDIS_DB="14"
export G21D_FINAL_REDIS_PORT="${TEST_REDIS_PORT}"
export G21D_FINAL_REDIS_DB="14"
export G21D_FINAL_POSTGRES_USER="${PG_USER}"
export G21D_FINAL_POSTGRES_PASSWORD="${PG_PASS}"
export PHYSICAL_REFUEL_TEST_QUEUE_PREFIX="refuel-gate-${GATE_ID}"

cd "${ROOT}"

echo "==> prisma validate"
npx prisma validate

echo "==> prisma migrate deploy (isolated, resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

echo "==> Postgres integration"
PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1 npm test -- \
  physical-refuel-reconciliation.postgres.integration --runInBand --forceExit

echo "==> Redis/BullMQ integration"
PHYSICAL_REFUEL_BULLMQ_INTEGRATION=1 npm test -- \
  fuel-station-enrichment-producer.redis.integration --runInBand --forceExit

echo "==> Multi-replica recovery integration"
PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1 npm test -- \
  physical-refuel-multi-replica-recovery.postgres-redis.integration --runInBand --forceExit

echo "==> Gate complete"
echo "ISOLATED_MIGRATION_CHAIN=PASS"
echo "POSTGRES_INTEGRATION_RUN=PASS"
echo "REDIS_BULLMQ_INTEGRATION_RUN=PASS"
echo "BULLMQ_FAILED_JOB_RECOVERY_INTEGRATION=PASS"
echo "BULLMQ_MULTI_REPLICA_RACE_SAFE=YES"
echo "FULL_MULTI_REPLICA_RECOVERY_E2E=PASS"
