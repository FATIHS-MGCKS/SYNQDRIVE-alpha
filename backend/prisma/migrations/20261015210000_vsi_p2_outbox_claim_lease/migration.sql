-- VSI P2 hardening — PROCESSING claim lease for crash-safe outbox delivery.

ALTER TYPE "VsiProfileLifecycleOutboxStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "vsi_profile_lifecycle_outbox"
  ADD COLUMN IF NOT EXISTS "claim_token" TEXT,
  ADD COLUMN IF NOT EXISTS "claim_expires_at" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "vsi_profile_lifecycle_outbox_status_claim_expires_idx"
  ON "vsi_profile_lifecycle_outbox"("status", "claim_expires_at");
