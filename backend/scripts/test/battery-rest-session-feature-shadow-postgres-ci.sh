#!/usr/bin/env bash
# M3.3C C4 — ephemeral PostgreSQL integration tests for shadow lifecycle wiring.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-rest-session-feature-shadow-postgres-ci] %s\n' "$*"; }

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

export BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=true
export BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true

log "C4 shadow trigger integration tests"
BATTERY_V2_REST_SESSION_FEATURE_SHADOW_INTEGRATION=1 npx jest rest-session-feature-shadow-trigger.integration --runInBand

log "battery-rest-session-feature-shadow-postgres-ci completed successfully"
