#!/usr/bin/env bash
# Battery Health V2 — frontend verification (tsc, vitest, e2e, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BATTERY_VITEST_PATTERN='battery-health|battery-lv-view-model|battery-hv-view-model|battery-health-v2-surfaces|battery-readiness-display|battery-alert-task-display|canonical-battery-ui.adapter|battery-health-query|battery-data-quality|battery-display|battery-health-detail-ui|components/battery|BatteryDataQualityBadge|BatteryConditionBars'

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Battery V2"
  npm test -- src/rental/lib/battery-test-fixtures.ts src/rental/lib/battery-lv-view-model.test.ts src/rental/lib/battery-hv-view-model.test.ts src/rental/lib/canonical-battery-ui.adapter.test.ts src/rental/lib/battery-health-v2-surfaces.test.ts src/rental/lib/battery-readiness-display.test.ts src/rental/lib/battery-alert-task-display.test.ts src/rental/lib/battery-health-query src/rental/lib/battery-data-quality.utils.test.ts src/rental/lib/battery-display.utils.test.ts src/rental/lib/battery-health-detail-ui.test.ts src/rental/components/battery src/rental/components/BatteryDataQualityBadge.test.tsx src/rental/components/BatteryConditionBars.test.tsx
}

run_e2e() {
  echo "==> Playwright — Battery Health V2"
  npm run test:e2e -- battery-health-flow.spec.ts battery-health-responsive.spec.ts --project=desktop-1280
}

run_build() {
  echo "==> Production build"
  npm run build
}

case "${1:-all}" in
  typecheck) run_typecheck ;;
  unit) run_unit ;;
  e2e) run_e2e ;;
  build) run_build ;;
  all)
    run_typecheck
    run_unit
    run_e2e
    run_build
    echo "==> Battery Health V2 frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|build|all]" >&2
    exit 1
    ;;
esac
