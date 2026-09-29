#!/usr/bin/env bash
# M3.3G G1 — ephemeral PostgreSQL integration tests for battery ground-truth authority.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-ground-truth-postgres-ci] %s\n' "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (ephemeral PostgreSQL)." >&2
  exit 1
fi

case "${DATABASE_URL,,}" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
    exit 1
    ;;
esac

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "G1 unit tests"
npx jest \
  ground-truth-admission.projector.spec \
  ground-truth-fingerprint.spec \
  ground-truth.service.spec \
  ground-truth-emission.service.spec \
  ground-truth-backed-source.guard.spec \
  --runInBand

log "G1 PostgreSQL integration"
BATTERY_V2_GROUND_TRUTH_INTEGRATION=1 npx jest ground-truth.postgres.integration --runInBand

log "G2 PostgreSQL integration"
BATTERY_V2_GROUND_TRUTH_INTEGRATION=1 npx jest ground-truth-g2.postgres.integration --runInBand

log "G2.1 PostgreSQL integration"
BATTERY_V2_GROUND_TRUTH_INTEGRATION=1 npx jest ground-truth-g2_1-orchestration.postgres.integration --runInBand
BATTERY_V2_GROUND_TRUTH_INTEGRATION=1 npx jest ground-truth-g2_1-concurrency.postgres.integration --runInBand

log "G2.2 PostgreSQL integration"
BATTERY_V2_GROUND_TRUTH_INTEGRATION=1 npx jest ground-truth-g2_2-cross-scope.postgres.integration --runInBand

log "battery-ground-truth-postgres-ci completed successfully"
