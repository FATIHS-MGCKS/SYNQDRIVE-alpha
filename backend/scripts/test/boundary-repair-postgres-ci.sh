#!/usr/bin/env bash
# Vehicle Detail critical PostgreSQL gate: boundary repair + VDC physical-state proof.
# Invoked by backend-boundary-postgres job via npm run test:boundary-repair:postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[boundary-repair-postgres-ci] %s\n' "$*"; }

log "Step 1/3: boundary repair PostgreSQL integration tests"
BOUNDARY_REPAIR_POSTGRES_INTEGRATION=1 INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION=1 \
  npx jest boundary-repair.postgres.integration intra-trip-gap-split-repair.postgres.integration --runInBand

log "Step 2/3: VDC physical-state ephemeral migration validation (isolated database)"
PHYSICAL_STATE_MIGRATION_EPHEMERAL=1 bash scripts/test/physical-state-migration-ephemeral.sh

log "Step 3/3: VDC physical-state PostgreSQL integration tests (db-pushed CI database)"
PHYSICAL_STATE_POSTGRES_INTEGRATION=1 PHYSICAL_STATE_POSTGRES_REQUIRED=1 \
  npx jest device-connection-physical-state.postgres.integration --runInBand --verbose

log "boundary-repair-postgres-ci completed successfully"
