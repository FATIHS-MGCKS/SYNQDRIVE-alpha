#!/usr/bin/env bash
# Battery Health V2 — unified backend verification (unit, integration, prisma, typecheck, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BATTERY_V2_PATTERN='battery-health|dimo-battery-signal|drive-profile-resolver|battery-policy-profile|lv-battery-chemistry|battery-v2|battery-critical\.detector'

run_unit() {
  echo "==> Battery V2 unit tests"
  npm test -- \
    --testPathPattern="$BATTERY_V2_PATTERN" \
    --testPathIgnorePatterns='integration' \
    --passWithNoTests
}

run_integration() {
  echo "==> Battery V2 integration: provider observation"
  npm test -- battery-provider-observation.integration

  if [[ "${BATTERY_V2_RETENTION_INTEGRATION:-0}" == "1" ]]; then
    echo "==> Battery V2 integration: retention (DB required)"
    BATTERY_V2_RETENTION_INTEGRATION=1 npm test -- battery-v2-retention.integration
  else
    echo "==> Skipping retention integration (set BATTERY_V2_RETENTION_INTEGRATION=1 to enable)"
  fi
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
  integration) run_integration ;;
  prisma) run_prisma_validate ;;
  typecheck) run_typecheck ;;
  build) run_build ;;
  all)
    run_unit
    run_integration
    run_prisma_validate
    run_typecheck
    run_build
    echo "==> Battery Health V2 verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|integration|prisma|typecheck|build|all]" >&2
    exit 1
    ;;
esac
