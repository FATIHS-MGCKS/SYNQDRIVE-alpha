-- Prompt 15: usage snapshot idempotency, discount and proration provenance
ALTER TABLE "billing_usage_snapshots"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "discount_snapshot_json" JSONB,
  ADD COLUMN IF NOT EXISTS "proration_details_json" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_usage_snapshots_idempotency_key_key"
  ON "billing_usage_snapshots" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
