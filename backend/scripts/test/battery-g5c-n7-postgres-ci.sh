#!/usr/bin/env bash
# G5C-N7-H2 — canonical REST anchor + assessment consumer PostgreSQL integration (ephemeral CI/local only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-g5c-n7-postgres-ci] %s\n' "$*"; }

G5C_N7_ANCHOR_SPEC="src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-canonical-target-anchor.g5c-n7.postgres.integration.spec.ts"
G5C_N7_ASSESSMENT_SPEC="src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-canonical-target-anchor.g5c-n7.assessment-consumer.postgres.integration.spec.ts"

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

log "G5C-N7 postgres integration tests (runTestsByPath)"
BATTERY_V2_G5C_N7_POSTGRES_INTEGRATION=1 npx jest --runTestsByPath \
  "$G5C_N7_ANCHOR_SPEC" \
  "$G5C_N7_ASSESSMENT_SPEC" \
  --runInBand \
  --verbose

log "battery-g5c-n7-postgres-ci completed successfully"
