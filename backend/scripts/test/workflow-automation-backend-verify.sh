#!/usr/bin/env bash
# Workflow Automation production readiness — unified backend verification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

WORKFLOW_PATTERN='modules/workflows|task-automation|task-automation-outbox|booking-pickup-return-timing'

run_unit() {
  echo "==> Workflow Automation unit & service tests"
  npm test -- \
    --testPathPattern="$WORKFLOW_PATTERN" \
    --testPathIgnorePatterns='postgres\.invariants|integration\.spec' \
    --passWithNoTests
}

run_integration() {
  echo "==> Workflow Automation integration harnesses"
  npm test -- \
    workflow-engine.production \
    task-automation-workflow-migration \
    booking-task.pipeline.integration \
    booking-document-task.sync \
    invoice-payment-task.integration \
    vehicle-cleaning-task.integration \
    --passWithNoTests
}

run_security() {
  echo "==> Workflow security & audit tests"
  npm test -- \
    workflow-security.production \
    workflow-audit \
    workflow-communication-contract \
    --passWithNoTests
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

case "${1:-all}" in
  unit) run_unit ;;
  integration) run_integration ;;
  security) run_security ;;
  typecheck) run_typecheck ;;
  all)
    run_unit
    run_security
    run_integration
    run_typecheck
    echo "==> Workflow Automation backend verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|integration|security|typecheck|all]" >&2
    exit 1
    ;;
esac
