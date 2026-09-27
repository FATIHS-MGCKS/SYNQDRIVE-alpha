#!/usr/bin/env bash
# M3.3F F4.1 — ephemeral PostgreSQL integration tests for longitudinal D3 reconciliation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-longitudinal-reconciliation-postgres-ci] %s\n' "$*"; }

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

log "F4.1 reconciliation unit tests"
npx jest \
  longitudinal-reconciliation.config.spec \
  longitudinal-reconciliation.service.spec \
  battery-v2-longitudinal-materialization-reconciliation.scheduler.spec \
  longitudinal-source-evidence-ack.repository.spec \
  --runInBand

log "F4.1 reconciliation PostgreSQL integration tests"
BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTEGRATION=1 npx jest \
  longitudinal-reconciliation.integration \
  --runInBand

log "battery-longitudinal-reconciliation-postgres-ci completed successfully"
