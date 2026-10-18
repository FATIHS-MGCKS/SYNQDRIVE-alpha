#!/usr/bin/env bash
# Production-equivalent Nest bootstrap gate (mirrors vps-deploy-release.sh boot check).
# Uses ephemeral CI-local PostgreSQL + Redis only — never production hosts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[synqdrive-nest-boot-check-ci] %s\n' "$*"; }

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

# Non-production CI-only secret — mirrors VPS boot check except shared backend.env secrets.
export JWT_SECRET="${JWT_SECRET:-ci-synqdrive-nest-boot-check-jwt-secret-not-for-production}"
export NODE_ENV="${NODE_ENV:-test}"

if [[ "${SYNQDRIVE_NEST_BOOT_CHECK_SKIP:-}" == "1" ]]; then
  echo "SYNQDRIVE_NEST_BOOT_CHECK_SKIP=1 is not permitted in CI" >&2
  exit 1
fi

log "DTC-02 / deploy Nest DI metadata regression (unit)"
npx jest --runTestsByPath \
  src/modules/vehicle-intelligence/dtc/observability/dtc02-observability.nest-di.spec.ts \
  src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-window-g5c-n7.nest-di.spec.ts \
  scripts/test/synqdrive-boot-check-exit.contract.spec.ts \
  --runInBand

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "production build"
npm run build

log "compiled SYNQDRIVE_BOOT_CHECK=1 (production deploy contract)"
if ! SYNQDRIVE_BOOT_CHECK=1 timeout 120 node dist/src/main.js; then
  log "FAIL: Nest bootstrap boot check did not pass"
  exit 1
fi

log "synqdrive-nest-boot-check-ci completed successfully"
