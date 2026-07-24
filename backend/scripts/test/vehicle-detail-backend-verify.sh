#!/usr/bin/env bash
# Vehicle detail backend — unified security & integration verification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VEHICLE_DETAIL_SECURITY_PATTERN='vehicles-security-negative|vehicles\.controller\.security\.characterization|vehicles\.service\.detail-integration|vehicles-rental-requirements\.security|vehicles\.controller\.status-patch|vehicles\.controller\.fleet-connectivity'

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

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

case "${1:-all}" in
  security) run_security ;;
  integration) run_integration ;;
  typecheck) run_typecheck ;;
  all)
    run_security
    run_integration
    run_typecheck
    ;;
  *)
    echo "Usage: $0 [all|security|integration|typecheck]" >&2
    exit 1
    ;;
esac

echo "==> Vehicle detail backend verify: OK"
