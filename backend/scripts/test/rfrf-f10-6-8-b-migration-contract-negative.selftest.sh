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

cleanup() {
  rfrf_test_psql_superuser_quiet "DROP DATABASE IF EXISTS ${PG_DB};"
  rfrf_test_psql_superuser_quiet "DROP ROLE IF EXISTS ${PG_USER};"
}
trap cleanup EXIT

rfrf_test_psql_superuser "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
rfrf_test_psql_superuser "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"

cd "${BACKEND_ROOT}"
npx prisma generate
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

rfrf_test_psql_superuser_quiet "ALTER TABLE raw_refuel_candidates DROP COLUMN IF EXISTS recovery_next_attempt_at;"

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
