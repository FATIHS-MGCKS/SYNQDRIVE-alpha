#!/usr/bin/env bash
# RFRF F9 — independent-replica PostgreSQL + Redis integration closure gate.
# Runs net-new F9 proofs, then orchestrates authoritative prior-phase gate scripts.
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

assert_test_db_isolation() {
  local pg_host="$1" pg_db="$2"
  case "${pg_host}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${pg_host})" >&2
      exit 1
      ;;
  esac
  if [[ "${pg_db}" != rfrf_f9_* ]]; then
    echo "Refusing: database name must match rfrf_f9_* (got ${pg_db})" >&2
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

run_f9_independent_replica_tests() {
  local gate_id="rfrf_f9_$(date +%s)"
  local pg_host="${TEST_POSTGRES_HOST:-127.0.0.1}"
  local pg_port="${TEST_POSTGRES_PORT:-5432}"
  local redis_port="${TEST_REDIS_PORT:-56379}"
  local pg_db="rfrf_f9_${gate_id//-/_}"
  local pg_user="rfrf_f9_${gate_id//-/_}_u"
  local pg_pass="rfrf_f9_${gate_id}_local"
  local redis_started=0

  cleanup_f9() {
    if [[ "${redis_started:-0}" == "1" ]]; then
      redis-cli -p "${redis_port}" shutdown nosave 2>/dev/null || true
    fi
    rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${pg_db};"
    rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${pg_user};"
  }
  trap cleanup_f9 EXIT

  export TEST_POSTGRES_HOST="${pg_host}"
  export TEST_POSTGRES_PORT="${pg_port}"
  export TEST_POSTGRES_DATABASE="${pg_db}"
  export TEST_REDIS_HOST="127.0.0.1"
  export TEST_REDIS_PORT="${redis_port}"
  export G21D_FINAL_POSTGRES_DATABASE="${pg_db}"
  export G21D_FINAL_POSTGRES_USER="${pg_user}"
  export G21D_FINAL_POSTGRES_PASSWORD="${pg_pass}"
  export G21D_FINAL_REDIS_PORT="${redis_port}"
  export G21D_FINAL_REDIS_DB="14"

  echo "==> F9 net-new: isolated PostgreSQL on ${pg_host}:${pg_port}/${pg_db}"
  rfrf_test_psql_superuser "CREATE ROLE ${pg_user} LOGIN PASSWORD '${pg_pass}';"
  rfrf_test_psql_superuser "CREATE DATABASE ${pg_db} OWNER ${pg_user};"

  export DATABASE_URL="postgresql://${pg_user}:${pg_pass}@${pg_host}:${pg_port}/${pg_db}?schema=public"
  assert_test_db_isolation "${pg_host}" "${pg_db}"

  echo "==> F9 net-new: isolated Redis on 127.0.0.1:${redis_port}"
  redis-server \
    --port "${redis_port}" \
    --bind 127.0.0.1 \
    --save "" \
    --appendonly no \
    --daemonize yes \
    --databases 16

  for _ in $(seq 1 30); do
    if redis-cli -p "${redis_port}" ping 2>/dev/null | grep -q PONG; then
      break
    fi
    sleep 1
  done
  redis-cli -p "${redis_port}" ping
  redis_started=1

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

  cleanup_f9
  trap - EXIT
}

run_f9_independent_replica_tests

echo "==> F9-P7: existing multi-replica recovery gate (reference)"
bash "${SCRIPT_DIR}/rfrf-f7-multi-replica-recovery-gate.sh"

echo "==> F9-P8: F5-PR2 atomic promotion gate"
bash "${SCRIPT_DIR}/rfrf-f5-pr2-atomic-promotion-gate.sh"

echo "==> F9-P9: F5-PR3.1 post-commit G2 handoff gate"
bash "${SCRIPT_DIR}/rfrf-f5-pr3-g2-handoff-gate.sh"

echo "==> F7 recovery completeness gate"
bash "${SCRIPT_DIR}/rfrf-f7-recovery-completeness-gate.sh"

echo "==> F6 G2 payload compatibility gate"
bash "${SCRIPT_DIR}/rfrf-f6-g2-payload-compatibility-gate.sh"

echo "==> F5-PR1 convergence gate"
bash "${SCRIPT_DIR}/rfrf-f5-pr1-authoritative-convergence-gate.sh"

echo "==> F8 operational telemetry gate"
bash "${SCRIPT_DIR}/rfrf-f8-operational-telemetry-gate.sh"

echo "==> G2.1b/c/d semantic recovery regression"
cd "${BACKEND_ROOT}"
npm test -- --runInBand --forceExit \
  --testPathPattern='physical-refuel-g21[bcd]'

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
