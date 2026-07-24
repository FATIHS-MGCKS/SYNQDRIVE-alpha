#!/usr/bin/env bash
# Vehicle Detail Page — unit test verification (Prompt 29/36).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_unit() {
  echo "==> Vitest — Vehicle Detail remediation suite"
  npm run test:vehicle-detail
}

case "${1:-all}" in
  unit) run_unit ;;
  all)
    run_unit
    echo "==> Vehicle Detail unit verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|all]" >&2
    exit 1
    ;;
esac
