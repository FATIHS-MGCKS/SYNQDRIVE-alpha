#!/usr/bin/env bash
# Vehicle Detail — unified backend verification (unit, security, integration, observability).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VD_PATTERN='vehicle-detail|vehicles\.controller\.status-patch|overview-map-position|vehicle-operational-state-v2'
VEHICLE_DETAIL_SECURITY_PATTERN='vehicles-security-negative|vehicles\.controller\.security\.characterization|vehicles\.service\.detail-integration|vehicles-rental-requirements\.security|vehicles\.controller\.status-patch|vehicles\.controller\.fleet-connectivity|vehicle-detail-security-negative'

run_unit() {
  echo "==> Vehicle detail unit & characterization tests"
  npm test -- \
    --testPathPattern="$VD_PATTERN" \
    --testPathIgnorePatterns='integration|postgres\.invariants' \
    --passWithNoTests
}

run_security() {
  echo "==> Vehicle detail security & characterization matrix"
  npm test -- \
    --testPathPattern="$VEHICLE_DETAIL_SECURITY_PATTERN" \
    --passWithNoTests
}

run_integration() {
  echo "==> Vehicle detail service integration specs"
  npm test -- vehicles.service.detail-integration
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
  integration) run_integration ;;
  observability) run_observability ;;
  typecheck) run_typecheck ;;
  all)
    run_unit
    run_observability
    run_security
    run_integration
    ;;
  ci)
    run_typecheck
    run_unit
    run_observability
    run_security
    run_integration
    ;;
  *)
    echo "Usage: $0 [all|ci|unit|security|integration|observability|typecheck]" >&2
    exit 1
    ;;
esac

echo "Vehicle detail backend verification complete."
