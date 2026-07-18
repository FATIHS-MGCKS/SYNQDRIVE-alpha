#!/usr/bin/env bash
# Document Intake V2 — unified backend verification (unit, integration, prisma, typecheck, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DOCUMENT_INTAKE_V2_PATTERN='modules/document-extraction'

run_unit() {
  echo "==> Document Intake V2 unit tests"
  npm test -- \
    --testPathPattern="$DOCUMENT_INTAKE_V2_PATTERN" \
    --testPathIgnorePatterns='integration|\.live\.integration\.' \
    --passWithNoTests
}

run_integration() {
  echo "==> Document Intake V2 integration tests"
  npm test -- \
    document-extraction.pipeline.integration \
    document-action-plan.state-machine.integration \
    document-intake-v2-race-conditions.integration

  if [[ "${DOCUMENT_INTAKE_V2_LIVE_INTEGRATION:-0}" == "1" ]]; then
    echo "==> Document Intake V2 live integration (Mistral/OCR — opt-in)"
    DOCUMENT_EXTRACTION_LIVE_INTEGRATION=1 npm test -- document-extraction.live.integration
  else
    echo "==> Skipping live integration (set DOCUMENT_INTAKE_V2_LIVE_INTEGRATION=1 to enable)"
  fi
}

run_matrix_dry_run() {
  echo "==> Document Intake test matrix dry-run (T01–T40)"
  npx ts-node -r tsconfig-paths/register scripts/audit/document-intake-test-matrix-dry-run.ts
}

run_prisma_validate() {
  echo "==> Prisma migration timestamp uniqueness"
  bash scripts/test/verify-prisma-migration-timestamps.sh

  echo "==> Prisma schema validate"
  npm run prisma:validate
}

run_typecheck() {
  echo "==> TypeScript typecheck (document-extraction module)"
  npx tsc --noEmit -p tsconfig.document-intake.json
}

run_build() {
  echo "==> NestJS build"
  npm run build
}

case "${1:-all}" in
  unit) run_unit ;;
  integration) run_integration ;;
  matrix) run_matrix_dry_run ;;
  prisma) run_prisma_validate ;;
  typecheck) run_typecheck ;;
  build) run_build ;;
  all)
    run_unit
    run_integration
    run_matrix_dry_run
    run_prisma_validate
    run_typecheck
    run_build
    echo "==> Document Intake V2 verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|integration|matrix|prisma|typecheck|build|all]" >&2
    exit 1
    ;;
esac
