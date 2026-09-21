#!/usr/bin/env bash
# Negative proof: B migration contract verifier must fail before db push when B column missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/rfrf-isolated-postgres-admin.sh"

BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_ID="rfrf_f10_6_8_b_neg_$(date +%s)"
PG_HOST="${TEST_POSTGRES_HOST:-localhost}"
PG_PORT="${TEST_POSTGRES_PORT:-5432}"
PG_DB="rfrf_f10_6_8_b_neg_${GATE_ID//-/_}"
PG_USER="rfrf_f10_6_8_b_neg_${GATE_ID//-/_}_u"
PG_PASS="rfrf_f10_6_8_b_neg_${GATE_ID}_local"

assert_test_db_isolation() {
  case "${PG_HOST}" in
    localhost|127.0.0.1) ;;
    *)
      echo "Refusing: TEST_POSTGRES_HOST must be localhost or 127.0.0.1 (got ${PG_HOST})" >&2
      exit 1
      ;;
  esac
  if [[ "${PG_DB}" != rfrf_f10_6_8_b_neg_* ]]; then
    echo "Refusing: database name must match rfrf_f10_6_8_b_neg_* (got ${PG_DB})" >&2
    exit 1
  fi
  if [[ "${DATABASE_URL}" == *"app.synqdrive"* || "${DATABASE_URL}" == *"production"* ]]; then
    echo "Refusing: production-like DATABASE_URL detected" >&2
    exit 1
  fi
}

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
assert_test_db_isolation

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

assert_test_db_isolation
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE raw_refuel_candidates DROP COLUMN IF EXISTS recovery_next_attempt_at',
    );
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error('failed to drop recovery_next_attempt_at for negative test:', error.message);
  process.exit(2);
});
NODE

set +e
node scripts/test/verify-rfrf-f10-6-8-b-migration-contract.mjs
VERIFY_EXIT=$?
set -e

if [[ "$VERIFY_EXIT" -eq 0 ]]; then
  echo "expected B migration contract verification to fail when recovery_next_attempt_at is missing" >&2
  exit 1
fi

echo "B_MIGRATION_CONTRACT_NEGATIVE_TEST=PASS"
echo "DB_PUSH_NOT_REACHED_AFTER_B_CONTRACT_FAILURE=YES"
