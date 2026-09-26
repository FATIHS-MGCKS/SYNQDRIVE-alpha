#!/usr/bin/env bash
# ERD E6.3 — real BullMQ + Redis charging enrichment queue gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[erd-e6-3-bullmq-redis-ci] %s\n' "$*"; }

if [[ -n "${TEST_REDIS_PORT:-}" ]]; then
  if ! redis-cli -p "${TEST_REDIS_PORT}" ping >/dev/null 2>&1; then
    log "ERROR: Redis not reachable on port ${TEST_REDIS_PORT}"
    exit 1
  fi
  log "Using external Redis on port ${TEST_REDIS_PORT}"
else
  log "Using redis-memory-server (embedded Redis-compatible server)"
fi

log "ERD E6.3 BullMQ + Redis Q1–Q10 gate"
ERD_E6_3_BULLMQ_REDIS_INTEGRATION=1 ERD_E6_3_BULLMQ_REDIS_REQUIRED=1 \
  npx jest erd-e6-3-charging-station-enrichment.bullmq.redis.integration --runInBand --forceExit --verbose

log "erd-e6-3-bullmq-redis-ci completed successfully"
