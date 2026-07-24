#!/usr/bin/env bash
# Vehicle Detail — unified backend verification (unit, security, typecheck).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VD_PATTERN='vehicle-detail|vehicles\.controller\.status-patch|overview-map-position|vehicle-operational-state-v2'

run_unit() {
  echo "==> Vehicle detail unit & characterization tests"
  npm test -- \
    --testPathPattern="$VD_PATTERN" \
    --testPathIgnorePatterns='integration|postgres\.invariants' \
    --passWithNoTests
}

run_security() {
  echo "==> Vehicle detail security negative matrix"
  npm test -- vehicle-detail-security-negative
}

run_observability() {
  echo "==> Vehicle detail observability metrics"
  npm test -- vehicle-detail-prometheus.metrics vehicle-detail-log.util
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

case "${1:-all}" in
  unit) run_unit ;;
  security) run_security ;;
  observability) run_observability ;;
  typecheck) run_typecheck ;;
  all)
    run_unit
    run_observability
    run_security
    ;;
  ci)
    run_typecheck
    run_unit
    run_observability
    run_security
    ;;
  *)
    echo "Usage: $0 [all|ci|unit|security|observability|typecheck]" >&2
    exit 1
    ;;
esac

echo "Vehicle detail backend verification complete."
