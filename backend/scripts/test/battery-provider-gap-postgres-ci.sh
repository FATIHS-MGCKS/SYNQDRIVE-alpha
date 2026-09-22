#!/usr/bin/env bash
# M3.3 B1.2Y1 — provider observability gap PostgreSQL integration (ephemeral CI/local only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-provider-gap-postgres-ci] %s\n' "$*"; }

PROVIDER_GAP_INTEGRATION_SPEC="src/modules/vehicle-intelligence/battery-health/provider-observability-gap/provider-observability-gap.integration.spec.ts"
STALE_REPLAY_INTEGRATION_SPEC="src/modules/vehicle-intelligence/battery-health/provider-observability-gap/battery-v2-snapshot-stale-replay-gap.integration.spec.ts"
SECTION_13_2_INTEGRATION_SPEC="src/modules/vehicle-intelligence/battery-health/provider-observability-gap/provider-observability-gap-b1-2w-section-13-2.integration.spec.ts"

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

log "provider observability gap integration tests (runTestsByPath)"
BATTERY_V2_PROVIDER_GAP_INTEGRATION=1 npx jest --runTestsByPath \
  "$PROVIDER_GAP_INTEGRATION_SPEC" \
  "$STALE_REPLAY_INTEGRATION_SPEC" \
  "$SECTION_13_2_INTEGRATION_SPEC" \
  --runInBand \
  --verbose

log "battery-provider-gap-postgres-ci completed successfully"
