-- HV snapshot observation dedup columns (additive).

ALTER TABLE "hv_battery_health_snapshots"
    ADD COLUMN IF NOT EXISTS "provider_received_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "energy_observed_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
    ADD COLUMN IF NOT EXISTS "provider_soh_percent" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "charging_cable_connected" BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS "hv_battery_health_snapshots_idempotency_key"
    ON "hv_battery_health_snapshots"("vehicle_id", "idempotency_key");
