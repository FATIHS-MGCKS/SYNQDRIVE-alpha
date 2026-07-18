#!/usr/bin/env bash
# Stations V2 — frontend verification (tsc, vitest, e2e, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Stations V2"
  npm test -- \
    src/rental/lib/stations-v2-test-fixtures.ts \
    src/rental/components/stations/stations-ui-quality.test.ts \
    src/rental/components/stations/stations-permissions-ui.test.ts \
    src/rental/components/stations/station-detail-tabs.test.ts \
    src/rental/components/stations/station-detail-navigation.test.ts \
    src/rental/components/stations/station-data-states.integration.test.ts \
    src/rental/components/stations/station-vehicle-workflow.integration.test.ts \
    src/rental/components/stations/station-team-activity.integration.test.ts \
    src/rental/components/stations/stations-v2-frontend-package.test.ts \
    src/rental/lib/stations-tab-a11y.test.ts \
    src/rental/lib/stations-ui-format.test.ts \
    src/rental/lib/stations-v2-ui-capabilities.test.ts \
    src/rental/lib/station-view-state.test.ts \
    src/rental/lib/station-form.validation.test.ts \
    src/rental/lib/station-vehicle-workflow.utils.test.ts \
    src/rental/lib/station-fleet-read-model.utils.test.ts \
    src/rental/lib/station-overview-decision.utils.test.ts \
    src/rental/lib/station-org-summaries.utils.test.ts \
    src/rental/lib/stationUtils.summary.test.ts \
    src/rental/lib/fleet-station-filter.test.ts
}

run_e2e() {
  echo "==> Playwright — Stations V2"
  npm run test:e2e -- stations-v2-flow.spec.ts stations-v2-responsive.spec.ts --project=desktop-1280
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
    echo "==> Stations V2 frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|build|all]" >&2
    exit 1
    ;;
esac
