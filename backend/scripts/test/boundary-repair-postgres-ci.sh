#!/usr/bin/env bash
# Vehicle Detail critical PostgreSQL gate: boundary repair + VDC physical-state proof.
# Invoked by backend-boundary-postgres job via npm run test:boundary-repair:postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[boundary-repair-postgres-ci] %s\n' "$*"; }

log "Step 1/4: boundary repair PostgreSQL integration tests"
BOUNDARY_REPAIR_POSTGRES_INTEGRATION=1 INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION=1 \
  npx jest boundary-repair.postgres.integration intra-trip-gap-split-repair.postgres.integration --runInBand

log "Step 2/4: VDC physical-state ephemeral migration validation (isolated database)"
PHYSICAL_STATE_MIGRATION_EPHEMERAL=1 bash scripts/test/physical-state-migration-ephemeral.sh

log "Step 3/4: VDC physical-state PostgreSQL integration tests (db-pushed CI database)"
PHYSICAL_STATE_POSTGRES_INTEGRATION=1 PHYSICAL_STATE_POSTGRES_REQUIRED=1 \
  npx jest --testPathPattern='(device-connection-physical|physical-state-reconcile).*postgres\.integration' --runInBand --verbose

log "Step 4/4: ERD E2 native HvChargeSession PostgreSQL gate"
ERD_E2_POSTGRES_INTEGRATION=1 ERD_E2_POSTGRES_REQUIRED=1 \
  npx jest hv-charge-session-native.postgres.integration --runInBand --verbose

log "Step 5/8: ERD E3 fallback + convergence PostgreSQL gate"
ERD_E3_POSTGRES_INTEGRATION=1 ERD_E3_POSTGRES_REQUIRED=1 \
  npx jest hv-fallback-native-convergence.postgres.integration --runInBand --verbose

log "Step 6/8: ERD E4 Postgres liveness gate (PostgreSQL only — Redis/BullMQ gate is step 7/8)"
ERD_E4_POSTGRES_REDIS_INTEGRATION=1 ERD_E4_POSTGRES_REDIS_REQUIRED=1 \
  npx jest erd-e4-reconciliation-liveness.postgres.integration erd-e4-reconciliation-liveness.spec --runInBand --verbose

log "Step 7/8: ERD E4 BullMQ + Redis liveness gate (real Queue/Worker on Redis)"
ERD_E4_BULLMQ_REDIS_INTEGRATION=1 ERD_E4_BULLMQ_REDIS_REQUIRED=1 \
  npx jest erd-e4-reconciliation-liveness.bullmq.redis.integration --runInBand --forceExit --verbose

log "Step 8/8: ERD E5.1 recharge projection foundation PostgreSQL gate (ephemeral migrate deploy)"
bash scripts/test/erd-e5-1-migration-ephemeral-gate.sh

log "Step 9/10: ERD E5.2 canonical recharge projector PostgreSQL gate"
ERD_E5_2_POSTGRES_INTEGRATION=1 ERD_E5_2_POSTGRES_REQUIRED=1 \
  npx jest erd-e5-2-recharge-projector.postgres.integration --runInBand --verbose

log "Step 10/10: ERD E5.3 late-native handoff PostgreSQL gate"
ERD_E5_3_POSTGRES_INTEGRATION=1 ERD_E5_3_POSTGRES_REQUIRED=1 \
  npx jest erd-e5-3-late-native-handoff.postgres.integration --runInBand --verbose

log "boundary-repair-postgres-ci completed successfully"
