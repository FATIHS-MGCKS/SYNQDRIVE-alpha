#!/usr/bin/env bash
# Workflow Automation — unified backend verification (unit, security, integration, typecheck).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

WORKFLOW_PATTERN='modules/workflows|task-automation-workflow-migration|task-automation-outbox|task-automation-execution-router|pickup-overdue\.detector'

run_unit() {
  echo "==> Workflow automation unit & harness tests"
  npm test -- \
    --testPathPattern="$WORKFLOW_PATTERN" \
    --passWithNoTests
}

run_security() {
  echo "==> Workflow automation security negative matrix"
  npm test -- workflows-security-negative
}

run_integration() {
  echo "==> Workflow automation integration harnesses"
  npm test -- \
    workflow-engine.integration \
    workflow-engine.concurrency \
    workflow-failure-injection \
    workflow-automation-production-matrix
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

case "${1:-all}" in
  unit) run_unit ;;
  security) run_security ;;
  integration) run_integration ;;
  typecheck) run_typecheck ;;
  all)
    run_unit
    run_security
    run_integration
    run_typecheck
    echo "==> Workflow automation backend verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|security|integration|typecheck|all]" >&2
    exit 1
    ;;
esac
