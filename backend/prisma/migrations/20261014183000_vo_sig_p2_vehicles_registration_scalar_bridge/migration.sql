-- VO-SIG P2: bridge Prisma Vehicle registration scalars missing from historical migration chain.
-- Append-only; safe on Production where columns may already exist.

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "front_weight_distribution_pct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "brake_force_front_percent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_service_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_service_odometer_km" INTEGER,
  ADD COLUMN IF NOT EXISTS "next_service_due_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "service_interval_manufacturer_km" INTEGER,
  ADD COLUMN IF NOT EXISTS "service_interval_manufacturer_months" INTEGER,
  ADD COLUMN IF NOT EXISTS "last_oil_change_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_oil_change_odometer_km" INTEGER,
  ADD COLUMN IF NOT EXISTS "oil_change_interval_km" INTEGER,
  ADD COLUMN IF NOT EXISTS "oil_change_interval_months" INTEGER,
  ADD COLUMN IF NOT EXISTS "hv_battery_capacity_kwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tank_capacity_liters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_tuv_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_tuv_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_bokraft_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_bokraft_date" TIMESTAMP(3);
