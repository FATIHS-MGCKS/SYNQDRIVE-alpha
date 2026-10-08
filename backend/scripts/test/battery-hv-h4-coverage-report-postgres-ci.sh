#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
log() { printf '[battery-hv-h4-coverage-report-postgres-ci] %s\n' "$*"; }

log "unit tests (hv-h4)"
npm run test:battery:v2:hv-h4

log "postgres integration (battery v2 retention — A3.4 service path)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
npm run test:battery:retention:integration -- --runInBand

log "postgres integration (hv-h4 coverage report)"
export M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL="${DATABASE_URL}"
export M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED=1
BATTERY_HV_H4_REPORT_INTEGRATION=1 npm run test:battery:v2:hv-h4:postgres -- --runInBand

log "battery-hv-h4-coverage-report-postgres-ci completed successfully"
