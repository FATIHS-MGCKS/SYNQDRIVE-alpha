-- DTC-01C: separate partial webhook watermarks on DTC source head

ALTER TABLE "vehicle_dtc_source_heads"
  ADD COLUMN IF NOT EXISTS "last_partial_webhook_source_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_partial_webhook_codes_hash" TEXT;
