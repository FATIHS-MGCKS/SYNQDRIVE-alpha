#!/usr/bin/env bash
# Data authorization — unified backend verification (unit, integration, postgres, prisma).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DATA_AUTH_PATTERN='data-authorizations|data-authorization|policy-resolver|authorization-decision|enforcement-coverage|revocation-orchestrator|deny-switch|provider-grant|revocation-queue|policy-lifecycle|processing-activity-register|dpia-workflow|dpia-risk|processor-dpa|retention-deletion|compliance-evidence'

run_unit() {
  echo "==> Data authorization unit & in-memory integration tests"
  npm test -- \
    --testPathPattern="$DATA_AUTH_PATTERN" \
    --testPathIgnorePatterns='postgres\.(invariants|operations)|security-negative\.postgres' \
    --passWithNoTests
}

run_postgres_integration() {
  if [[ "${DATA_AUTH_POSTGRES_INTEGRATION:-0}" == "1" ]]; then
    echo "==> Data authorization PostgreSQL integration (DB + migrations required)"
    DATA_AUTH_POSTGRES_INTEGRATION=1 npm test -- \
      data-auth-postgres.invariants.integration \
      data-auth-security-negative.postgres.integration \
      data-auth-postgres.operations.integration
  else
    echo "==> Skipping PostgreSQL integration (set DATA_AUTH_POSTGRES_INTEGRATION=1 + DATABASE_URL)"
  fi
}

run_postgres_migration_check() {
  echo "==> Prisma migration timestamp uniqueness"
  bash scripts/test/verify-prisma-migration-timestamps.sh

  echo "==> Prisma schema validate"
  npm run prisma:validate
}

run_coverage() {
  echo "==> Data authorization coverage report"
  npm test -- \
    --coverage \
    --collectCoverageFrom='src/modules/data-authorizations/**/*.(t|j)s' \
    --collectCoverageFrom='!src/modules/data-authorizations/**/*.spec.ts' \
    --collectCoverageFrom='!src/modules/data-authorizations/testing/**' \
    --testPathPattern="$DATA_AUTH_PATTERN" \
    --testPathIgnorePatterns='postgres\.(invariants|operations)|security-negative\.postgres' \
    --passWithNoTests
}

case "${1:-all}" in
  unit) run_unit ;;
  postgres) run_postgres_integration ;;
  prisma) run_postgres_migration_check ;;
  coverage) run_coverage ;;
  all)
    run_unit
    run_postgres_integration
    run_postgres_migration_check
    echo "==> Data authorization backend verification complete"
    ;;
  *)
    echo "Usage: $0 [unit|postgres|prisma|coverage|all]" >&2
    exit 1
    ;;
esac
