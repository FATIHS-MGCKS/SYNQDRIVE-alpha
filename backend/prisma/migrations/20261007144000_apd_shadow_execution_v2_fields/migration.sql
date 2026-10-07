-- APDS-9.2 additive forensic / execution-contract fields (no backfill required).
ALTER TABLE "apd_shadow_reconciliation_decisions"
  ADD COLUMN IF NOT EXISTS "shadow_execution_version" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliation" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "enqueue_outcome" TEXT,
  ADD COLUMN IF NOT EXISTS "enqueue_outcome_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "real_poll_status" TEXT;

CREATE INDEX IF NOT EXISTS "apd_shadow_reconciliation_decisions_last_allowed_v2_idx"
  ON "apd_shadow_reconciliation_decisions" (
    "organization_id",
    "vehicle_id",
    "policy_version",
    "shadow_execution_version",
    "reconciliation",
    "real_poll_completed_at"
  );
