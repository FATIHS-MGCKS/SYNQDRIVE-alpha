#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
log() { printf '[battery-hv-h2-longitudinal-input-postgres-ci] %s\n' "$*"; }

log "unit tests (hv-h2)"
npm run test:battery:v2:hv-h2

log "postgres integration (hv-h2 report)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
BATTERY_HV_H2_REPORT_INTEGRATION=1 npm run test:battery:v2:hv-h2:postgres

log "battery-hv-h2-longitudinal-input-postgres-ci completed successfully"
