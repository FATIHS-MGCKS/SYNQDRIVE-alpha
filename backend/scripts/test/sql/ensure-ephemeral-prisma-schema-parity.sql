-- Test-only schema parity for disposable CI databases after `prisma migrate deploy`.
-- Closes known Prisma schema ↔ migration-chain gaps without rewriting historical migrations.
-- Columns here are already in schema.prisma; production may receive them via deploy paths outside this harness.
-- See: battery-v2-snapshot-stale-replay-gap.integration.spec.ts (ensureVehicleLatestStateColumnsForIntegration).

ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "powertrain_type" TEXT;
ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "battery_percent" DOUBLE PRECISION;
ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "fuel_percent" DOUBLE PRECISION;

ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_power_kw" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_soh_percent" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_temperature_c" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_charging_power_kw" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_added_energy_kwh" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_is_charging" BOOLEAN;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_charging_cable_connected" BOOLEAN;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_current_voltage" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_gross_capacity_kwh" DOUBLE PRECISION;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "traction_battery_current_energy_kwh" DOUBLE PRECISION;

ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "dtc_poll_error" TEXT;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "dtc_poll_status" TEXT;
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "last_dtc_poll_at" TIMESTAMP(3);
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "last_dtc_successful_check_at" TIMESTAMP(3);
ALTER TABLE "vehicle_latest_states" ADD COLUMN IF NOT EXISTS "obd_dtc_list" JSONB;
