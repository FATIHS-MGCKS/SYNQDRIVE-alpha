#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[pdi-identity-drift-shadow-postgres-ci] %s\n' "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  if docker info >/dev/null 2>&1; then
    bash scripts/test/ci-start-postgres.sh
  else
    log "DATABASE_URL unset and Docker unavailable"
    exit 1
  fi
fi

export PDI_IDENTITY_DRIFT_SHADOW_POSTGRES_INTEGRATION=1
export PDI_IDENTITY_DRIFT_SHADOW_POSTGRES_REQUIRED=1

log "Prisma migrate deploy"
bash scripts/test/prisma-migrate-deploy-resilient.sh

log "Running PDI identity drift shadow PostgreSQL integration tests"
npx jest --runInBand --forceExit \
  src/modules/physical-device-inventory/pdi-identity-drift-shadow.postgres.integration.spec.ts
