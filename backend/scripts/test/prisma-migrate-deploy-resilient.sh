#!/usr/bin/env bash
# Prisma migrate deploy with repository-approved special handling for:
# - 20260413230000_add_composite_indexes_batch_c (CREATE INDEX CONCURRENTLY)
# - 20260816110731_ci_r3b_production_history_tail_reconciliation (M252 table already
#   materialized by repaired 20260721270000 on fresh CI databases)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SPECIAL_MIGRATION="20260413230000_add_composite_indexes_batch_c"
TAIL_MIGRATION="20260816110731_ci_r3b_production_history_tail_reconciliation"
M252_TABLE="organization_role_assignment_drift_reconciliation_applications"

LOG="$(mktemp /tmp/prisma-migrate-deploy-resilient.XXXXXX.log)"
trap 'rm -f "$LOG"' EXIT

recover_special_composite_index() {
  echo "==> Special migration $SPECIAL_MIGRATION: applying via apply-composite-indexes.ts"
  npx ts-node scripts/apply-composite-indexes.ts
  npx prisma migrate resolve --applied "$SPECIAL_MIGRATION"
}

recover_duplicate_tail_m252() {
  echo "==> Tail migration $TAIL_MIGRATION: M252 table already present from predecessor migration"
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required for tail idempotency recovery" >&2
    return 1
  fi
  local exists
  local psql_url="${DATABASE_URL%%\?*}"
  exists=$(psql "$psql_url" -tAc "SELECT to_regclass('public.\"${M252_TABLE}\"') IS NOT NULL;")
  if [[ "$exists" != "t" ]]; then
    echo "Expected ${M252_TABLE} to exist before tail resolve" >&2
    return 1
  fi
  npx prisma migrate resolve --applied "$TAIL_MIGRATION"
}

attempt=0
max_attempts=4
while (( attempt < max_attempts )); do
  attempt=$((attempt + 1))
  set +e
  npx prisma migrate deploy 2>&1 | tee "$LOG"
  deploy_exit=${PIPESTATUS[0]}
  set -e
  if [[ "$deploy_exit" -eq 0 ]]; then
    exit 0
  fi

  if grep -q "$SPECIAL_MIGRATION" "$LOG" && grep -Eq '25001|CREATE INDEX CONCURRENTLY cannot run inside a transaction block' "$LOG"; then
    recover_special_composite_index
    continue
  fi

  if grep -q "$TAIL_MIGRATION" "$LOG" && grep -q "$M252_TABLE" "$LOG" && grep -Eq '42P07|already exists' "$LOG"; then
    recover_duplicate_tail_m252
    continue
  fi

  echo "prisma migrate deploy failed without a recognized recovery path" >&2
  exit "$deploy_exit"
done

echo "prisma migrate deploy exceeded recovery attempts ($max_attempts)" >&2
exit 1
