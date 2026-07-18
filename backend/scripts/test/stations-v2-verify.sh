#!/usr/bin/env bash
# Stations V2 — unified backend verification (unit/integration, prisma, typecheck, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

STATIONS_V2_PATTERN='stations|station-access-scope|station-scope|station-booking|station-capacity|station-kpis|station-summary|station-org-summaries|station-operations|handover-station|one-way-return|expected-station|vehicle-handover-station|vehicle-home-fleet|vehicle-change-home|vehicle-correct-current|vehicle-station-transfer|vehicle-station-position|bookings-handover.station|bookings.service.station-rules'

run_unit() {
  echo "==> Stations V2 backend tests"
  npm test -- --testPathPattern="$STATIONS_V2_PATTERN" --passWithNoTests
}

run_prisma_validate() {
  echo "==> Prisma migration timestamp uniqueness"
  bash scripts/test/verify-prisma-migration-timestamps.sh

  echo "==> Prisma schema validate"
  npm run prisma:validate
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

run_build() {
  echo "==> NestJS build"
  npm run build
}

case "${1:-all}" in
  unit) run_unit ;;
  prisma) run_prisma_validate ;;
  typecheck) run_typecheck ;;
  build) run_build ;;
  all)
    run_unit
    run_prisma_validate
    run_typecheck
    run_build
    echo "==> Stations V2 verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|prisma|typecheck|build|all]" >&2
    exit 1
    ;;
esac
