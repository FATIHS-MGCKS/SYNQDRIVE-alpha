#!/usr/bin/env bash
# Booking production readiness — frontend verification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Booking surfaces"
  npm run test:bookings
}

run_e2e() {
  echo "==> Playwright — Booking planner E2E"
  npm run test:bookings:e2e
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
    echo "==> Booking frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|build|all]" >&2
    exit 1
    ;;
esac
