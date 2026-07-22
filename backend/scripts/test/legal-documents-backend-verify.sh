#!/usr/bin/env bash
# Legal Documents — unified backend verification (unit, integration, prisma, typecheck).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

LEGAL_PATTERN='legal-document|legal-documents|booking-document-(bundle|completeness|generation|phase|pointer|task)|booking-pickup-gate|rental-contract-legal|document-storage\.(contract|config)'

run_unit() {
  echo "==> Legal documents unit & harness tests"
  npm test -- \
    --testPathPattern="$LEGAL_PATTERN" \
    --testPathIgnorePatterns='postgres\.invariants' \
    --passWithNoTests
}

run_security() {
  echo "==> Legal documents security negative matrix"
  npm test -- legal-documents-security-negative
}

run_integration_harness() {
  echo "==> Legal documents in-memory integration harnesses"
  npm test -- \
    legal-documents-activation.integration \
    legal-documents-lifecycle-events.integration \
    legal-document-delivery-evidence.integration \
    booking-pickup-gate.integration
}

run_postgres_integration() {
  if [[ "${LEGAL_DOCUMENTS_POSTGRES_INTEGRATION:-0}" == "1" ]]; then
    echo "==> Legal documents PostgreSQL invariants (DB required)"
    LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 npm test -- legal-documents-postgres.invariants.integration
  else
    echo "==> Skipping PostgreSQL invariants (set LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 + DATABASE_URL)"
  fi
}

run_prisma_validate() {
  echo "==> Prisma migration timestamp uniqueness"
  bash scripts/test/verify-prisma-migration-timestamps.sh

  echo "==> Prisma schema validate"
  npm run prisma:validate
}

run_typecheck() {
  echo "==> TypeScript typecheck"
  npx tsc --noEmit -p tsconfig.json
}

case "${1:-all}" in
  unit) run_unit ;;
  security) run_security ;;
  integration) run_integration_harness ;;
  postgres) run_postgres_integration ;;
  prisma) run_prisma_validate ;;
  typecheck) run_typecheck ;;
  all)
    run_unit
    run_security
    run_integration_harness
    run_postgres_integration
    run_prisma_validate
    run_typecheck
    echo "==> Legal documents backend verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|security|integration|postgres|prisma|typecheck|all]" >&2
    exit 1
    ;;
esac
