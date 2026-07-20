#!/usr/bin/env bash
# Voice AI — unified frontend verification (typecheck, build, lint, unit, mocked E2E).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript project references (tsc -b)"
  npx tsc -b
}

run_build() {
  echo "==> Vite production build"
  npm run build
}

run_lint() {
  echo "==> ESLint (voice frontend scope)"
  npm run lint:voice
}

run_unit() {
  echo "==> Vitest voice unit/characterization tests"
  npm test -- src/master/components/voice-control-plane src/rental/components/voice-assistant
}

run_e2e() {
  echo "==> Playwright voice E2E (mocked, no live calls)"
  npm run test:voice:e2e
}

case "${1:-all}" in
  typecheck) run_typecheck ;;
  build) run_build ;;
  lint) run_lint ;;
  unit) run_unit ;;
  e2e) run_e2e ;;
  all)
    run_typecheck
    run_build
    run_lint
    run_unit
    run_e2e
    echo "==> Voice AI frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|build|lint|unit|e2e|all]" >&2
    exit 1
    ;;
esac
