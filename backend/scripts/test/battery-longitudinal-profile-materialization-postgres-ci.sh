#!/usr/bin/env bash
# M3.3D D3 — ephemeral PostgreSQL integration tests for longitudinal profile materialization.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-longitudinal-profile-materialization-postgres-ci] %s\n' "$*"; }

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

log "D3 unit tests (fingerprint + mapper + repository + service)"
npx jest \
  longitudinal-profile-fingerprint.spec \
  longitudinal-profile-materialization.mapper.spec \
  longitudinal-profile-materialization.repository.spec \
  longitudinal-profile-materialization.service.spec \
  --runInBand

log "D3 PostgreSQL integration tests"
BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_INTEGRATION=1 npx jest \
  longitudinal-profile-materialization.integration \
  --runInBand

log "battery-longitudinal-profile-materialization-postgres-ci completed successfully"
