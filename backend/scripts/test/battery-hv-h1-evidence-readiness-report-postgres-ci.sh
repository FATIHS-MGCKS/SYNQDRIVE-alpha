#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
log() { printf '[battery-hv-h1-evidence-readiness-report-postgres-ci] %s\n' "$*"; }

log "unit tests (hv-h1)"
npm run test:battery:v2:hv-h1

log "postgres integration (hv-h1 report)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
BATTERY_HV_H1_REPORT_INTEGRATION=1 npm run test:battery:v2:hv-h1:postgres

log "battery-hv-h1-evidence-readiness-report-postgres-ci completed successfully"
