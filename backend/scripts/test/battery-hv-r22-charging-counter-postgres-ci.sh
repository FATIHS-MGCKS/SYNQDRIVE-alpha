#!/usr/bin/env bash
# HV R22-P1 — ephemeral PostgreSQL integration for charging counter evidence sidecar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-hv-r22-charging-counter-postgres-ci] %s\n' "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (ephemeral PostgreSQL)." >&2
  exit 1
fi

case "${DATABASE_URL,,}" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
    exit 1
    ;;
esac

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "unit tests (hv-charging-counter-evidence)"
npx jest \
  hv-charging-counter-evidence.spec \
  hv-charging-counter-evidence.revalidation.policy.v1.spec \
  hv-charging-counter-evidence.provider-fetch.v1.spec \
  --runInBand

log "PostgreSQL integration (charging counter evidence)"
BATTERY_V2_HV_CHARGING_COUNTER_INTEGRATION=1 npx jest \
  hv-charging-counter-evidence.postgres.integration.spec \
  --runInBand

log "battery-hv-r22-charging-counter-postgres-ci completed successfully"
