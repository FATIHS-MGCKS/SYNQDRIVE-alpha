#!/usr/bin/env bash
# Workflow Automation — frontend verification (typecheck, vitest, playwright, a11y, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Workflow Automation"
  npm run test:workflow-automation
}

run_e2e() {
  echo "==> Playwright — Workflow Automation E2E"
  npm run test:workflow-automation:e2e
}

run_a11y() {
  echo "==> Playwright — Workflow Automation accessibility"
  npm run test:workflow-automation:a11y
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
    echo "==> Workflow automation frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|a11y|build|all]" >&2
    exit 1
    ;;
esac
