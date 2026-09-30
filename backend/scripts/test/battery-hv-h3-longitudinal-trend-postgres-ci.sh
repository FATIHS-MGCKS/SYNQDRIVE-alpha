#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
log() { printf '[battery-hv-h3-longitudinal-trend-postgres-ci] %s\n' "$*"; }

log "unit tests (hv-h3)"
npm run test:battery:v2:hv-h3

log "postgres integration (hv-h3 report)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
BATTERY_HV_H3_REPORT_INTEGRATION=1 npm run test:battery:v2:hv-h3:postgres -- --runInBand

log "battery-hv-h3-longitudinal-trend-postgres-ci completed successfully"
