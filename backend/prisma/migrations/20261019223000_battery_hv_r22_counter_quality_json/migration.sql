ALTER TABLE "battery_hv_charging_counter_ingestion_batches"
  ADD COLUMN IF NOT EXISTS "counter_quality_json" JSONB;
