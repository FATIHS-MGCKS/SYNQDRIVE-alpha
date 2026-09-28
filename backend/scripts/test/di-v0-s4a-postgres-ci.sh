#!/usr/bin/env bash
# EXP-021 S4A — ephemeral PostgreSQL verification: migration cases (M01–M08) and the
# multi-connection race/kill suite (R01–R25, K01–K18, KS1–KS3) on local disposable databases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

exports="$(bash scripts/test/di-v0-s4a-postgres-bootstrap.sh | grep '^export ')"
eval "$exports"
export DI_V0_S4A_POSTGRES_INTEGRATION=1

npx jest --runInBand --forceExit \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-migration.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-races.postgres.integration.spec.ts
