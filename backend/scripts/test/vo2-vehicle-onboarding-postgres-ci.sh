#!/usr/bin/env bash
# VO-2 / VO-2.1 PostgreSQL CI gate: fresh migrate, legacy upgrade, integration tests.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export VO2_PERSISTENCE_PG=1

bash scripts/test/vo2-vehicle-onboarding-migration-ephemeral.sh
bash scripts/test/vo2-vehicle-onboarding-migration-legacy-upgrade.sh

npx jest vo2-persistence.postgres.integration --runInBand --forceExit

echo "[vo2-postgres-ci] all gates passed"
