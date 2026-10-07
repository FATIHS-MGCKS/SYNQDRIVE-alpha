-- APDS-9.2B: poll-start policy clock + per-poll visible LV forensic (additive, no backfill).
ALTER TABLE "apd_shadow_reconciliation_decisions"
  ADD COLUMN IF NOT EXISTS "real_poll_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "real_poll_visible_lv_source_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "apd_shadow_reconciliation_decisions_last_allowed_poll_start_v2_idx"
  ON "apd_shadow_reconciliation_decisions" (
    "organization_id",
    "vehicle_id",
    "policy_version",
    "shadow_execution_version",
    "real_poll_started_at"
  );
