#!/usr/bin/env bash
# Legal Documents — frontend verification (typecheck, vitest, playwright, a11y, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Legal Documents"
  npm run test:legal-documents
}

run_e2e() {
  echo "==> Playwright — Legal Documents E2E"
  npm run test:legal-documents:e2e
}

run_a11y() {
  echo "==> Playwright — Legal Documents accessibility"
  npm run test:legal-documents:a11y
}

run_build() {
  echo "==> Production build"
  npm run build
}

case "${1:-all}" in
  typecheck) run_typecheck ;;
  unit) run_unit ;;
  e2e) run_e2e ;;
  a11y) run_a11y ;;
  build) run_build ;;
  all)
    run_typecheck
    run_unit
    run_e2e
    run_a11y
    run_build
    echo "==> Legal Documents frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|a11y|build|all]" >&2
    exit 1
    ;;
esac
