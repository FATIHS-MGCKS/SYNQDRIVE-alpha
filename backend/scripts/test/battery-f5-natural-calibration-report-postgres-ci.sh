#!/usr/bin/env bash
# M3.3F F5.1 — ephemeral PostgreSQL integration tests for bounded natural calibration report.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-f5-natural-calibration-report-postgres-ci] %s\n' "$*"; }

assert_ephemeral_database_url() {
  local lower_url="${DATABASE_URL,,}"
  case "$lower_url" in
    *127.0.0.1*|*localhost*) ;;
    *)
      echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
      exit 1
      ;;
  esac
  case "$lower_url" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*)
      echo "DATABASE_URL must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (ephemeral PostgreSQL)." >&2
  exit 1
fi

assert_ephemeral_database_url

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "F5.1 unit tests (bounded report module)"
npm run test:battery:v2:f5-natural-calibration-report

log "F5.1 PostgreSQL integration (read-only transaction + bounds)"
BATTERY_F5_NATURAL_CALIBRATION_REPORT_INTEGRATION=1 npm run test:battery:v2:f5-natural-calibration-report:postgres

log "battery-f5-natural-calibration-report-postgres-ci completed successfully"
