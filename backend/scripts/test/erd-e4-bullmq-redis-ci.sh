#!/usr/bin/env bash
# ERD E4 — real BullMQ + Redis liveness (optional standalone; also step 7/7 in boundary-repair-postgres-ci.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[erd-e4-bullmq-redis-ci] %s\n' "$*"; }

if [[ -n "${TEST_REDIS_PORT:-}" ]]; then
  if ! redis-cli -p "${TEST_REDIS_PORT}" ping >/dev/null 2>&1; then
    log "ERROR: Redis not reachable on port ${TEST_REDIS_PORT}"
    exit 1
  fi
  log "Using external Redis on port ${TEST_REDIS_PORT}"
else
  log "Using redis-memory-server (embedded Redis-compatible server)"
fi

log "ERD E4 BullMQ + Redis liveness gate"
ERD_E4_BULLMQ_REDIS_INTEGRATION=1 ERD_E4_BULLMQ_REDIS_REQUIRED=1 \
  npx jest erd-e4-reconciliation-liveness.bullmq.redis.integration --runInBand --forceExit --verbose

log "erd-e4-bullmq-redis-ci completed successfully"
