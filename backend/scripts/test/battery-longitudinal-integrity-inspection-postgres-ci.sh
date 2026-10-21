#!/usr/bin/env bash
# M3.3D D4 — ephemeral PostgreSQL integration tests for longitudinal integrity inspection.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-longitudinal-integrity-inspection-postgres-ci] %s\n' "$*"; }

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

log "D4 unit tests"
npx jest \
  longitudinal-scientific-profile.parser.spec \
  longitudinal-integrity-inspection.self-integrity.spec \
  longitudinal-historical-input-summary.parser.spec \
  longitudinal-integrity-inspection.source-integrity.spec \
  longitudinal-integrity-inspection.aggregate.spec \
  longitudinal-integrity-inspection.service.spec \
  --runInBand

log "D4 PostgreSQL integration tests"
BATTERY_V2_LONGITUDINAL_INTEGRITY_INSPECTION_INTEGRATION=1 npx jest \
  longitudinal-integrity-inspection.integration \
  --runInBand

log "battery-longitudinal-integrity-inspection-postgres-ci completed successfully"
