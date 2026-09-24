#!/usr/bin/env bash
# ERD E4 — real BullMQ + Redis liveness (separate from PostgreSQL-only boundary-repair step 6).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[erd-e4-bullmq-redis-ci] %s\n' "$*"; }

if [[ -z "${TEST_REDIS_PORT:-}" ]]; then
  log "ERROR: TEST_REDIS_PORT must be set (CI installs redis-server on 56379)"
  exit 1
fi

if ! redis-cli -p "${TEST_REDIS_PORT}" ping >/dev/null 2>&1; then
  log "ERROR: Redis not reachable on port ${TEST_REDIS_PORT}"
  exit 1
fi

log "ERD E4 BullMQ + Redis liveness gate"
ERD_E4_BULLMQ_REDIS_INTEGRATION=1 ERD_E4_BULLMQ_REDIS_REQUIRED=1 \
  npx jest erd-e4-reconciliation-liveness.bullmq.redis.integration --runInBand --forceExit --verbose

log "erd-e4-bullmq-redis-ci completed successfully"
