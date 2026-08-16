#!/usr/bin/env bash
# Prisma migrate deploy with repository-approved special handling for:
# - 20260413230000_add_composite_indexes_batch_c (CREATE INDEX CONCURRENTLY)
# - 20260721270000_iam_role_assignment_drift_reconciliation (PostgreSQL 63-char identifier collision on empty DB)
# - 20260816110731_ci_r3b_production_history_tail_reconciliation (duplicate M252 after ephemeral recovery)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SPECIAL_MIGRATION="20260413230000_add_composite_indexes_batch_c"
M252_MIGRATION="20260721270000_iam_role_assignment_drift_reconciliation"
TAIL_MIGRATION="20260816110731_ci_r3b_production_history_tail_reconciliation"
M252_TABLE="organization_role_assignment_drift_reconciliation_applications"

# Ephemeral/bootstrap recovery is opt-in and must never run on Production deploy paths.
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY="${PRISMA_MIGRATE_EPHEMERAL_RECOVERY:-1}"

LOG="$(mktemp /tmp/prisma-migrate-deploy-resilient.XXXXXX.log)"
trap 'rm -f "$LOG"' EXIT

ephemeral_recovery_allowed() {
  [[ "${PRISMA_MIGRATE_EPHEMERAL_RECOVERY:-}" == "1" ]]
}

recover_special_composite_index() {
  echo "==> Special migration $SPECIAL_MIGRATION: applying via apply-composite-indexes.ts"
  npx ts-node scripts/apply-composite-indexes.ts
  npx prisma migrate resolve --applied "$SPECIAL_MIGRATION"
}

verify_m252_exact_parity() {
  npx ts-node scripts/verify-m252-exact-parity.ts
}

recover_m252_identifier_collision() {
  if ! ephemeral_recovery_allowed; then
    echo "M252 identifier-collision recovery blocked (not an allowed ephemeral context)" >&2
    return 1
  fi
  echo "==> Historical migration $M252_MIGRATION: applying ephemeral corrected semantic DDL"
  npx ts-node scripts/apply-m252-ephemeral-recovery.ts
  verify_m252_exact_parity
  npx prisma migrate resolve --applied "$M252_MIGRATION"
}

recover_duplicate_tail_m252() {
  if ! ephemeral_recovery_allowed; then
    echo "Tail duplicate recovery blocked (not an allowed ephemeral context)" >&2
    return 1
  fi
  echo "==> Tail migration $TAIL_MIGRATION: verifying exact M252 semantic parity before resolve"
  verify_m252_exact_parity
  npx prisma migrate resolve --applied "$TAIL_MIGRATION"
}

attempt=0
max_attempts=6
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

  if grep -q "$M252_MIGRATION" "$LOG" && grep -Eq '42P07|42710|already exists' "$LOG"; then
    recover_m252_identifier_collision
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
