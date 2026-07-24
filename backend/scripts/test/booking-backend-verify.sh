#!/usr/bin/env bash
# Booking production readiness — unified backend verification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BOOKING_PATTERN='modules/bookings|booking-pickup-gate|booking-document-|booking-payment-request|rental-contract-legal'

run_unit() {
  echo "==> Booking unit & characterization tests"
  npm test -- \
    --testPathPattern="$BOOKING_PATTERN" \
    --testPathIgnorePatterns='postgres\.invariants|e2e-flow' \
    --passWithNoTests
}

run_security() {
  echo "==> Booking security negative matrix"
  npm test -- bookings-security-negative booking-controller-permissions.characterization
}

run_integration() {
  echo "==> Booking integration harnesses"
  npm test -- \
    booking-pickup-gate.integration \
    booking-wizard-eligibility-e2e-flow
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

run_lint() {
  echo "==> ESLint (bookings module)"
  npm run lint:all -- --max-warnings=0 "src/modules/bookings/**/*.ts" 2>/dev/null || npm run lint:all
}

case "${1:-all}" in
  unit) run_unit ;;
  security) run_security ;;
  integration) run_integration ;;
  typecheck) run_typecheck ;;
  lint) run_lint ;;
  all)
    run_unit
    run_security
    run_integration
    run_typecheck
    echo "==> Booking backend verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|security|integration|typecheck|lint|all]" >&2
    exit 1
    ;;
esac
