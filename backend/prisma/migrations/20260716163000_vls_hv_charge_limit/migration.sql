-- Additive: HV charge limit from DIMO powertrainTractionBatteryChargingChargeLimit.

ALTER TABLE "vehicle_latest_states"
    ADD COLUMN IF NOT EXISTS "traction_battery_charge_limit_percent" DOUBLE PRECISION;
