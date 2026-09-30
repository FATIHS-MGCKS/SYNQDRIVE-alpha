#!/usr/bin/env bash
# VO-2 / VO-2.1 PostgreSQL CI gate: fresh migrate, legacy upgrade, integration tests.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for VO-2 integration tests" >&2
  exit 1
fi

export VO2_PERSISTENCE_PG=1

bash scripts/test/vo2-vehicle-onboarding-migration-ephemeral.sh
bash scripts/test/vo2-vehicle-onboarding-migration-legacy-upgrade.sh

log_ci() { printf '[vo2-postgres-ci] %s\n' "$*"; }
log_ci "Applying full migration chain to integration DATABASE_URL"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

npx jest vo2-persistence.postgres.integration --runInBand --forceExit

echo "[vo2-postgres-ci] all gates passed"
