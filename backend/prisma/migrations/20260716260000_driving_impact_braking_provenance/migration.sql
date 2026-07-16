-- P42 — separate measured vs proxy braking kinematics on driving impact rows

ALTER TABLE "TripDrivingImpact"
  ADD COLUMN IF NOT EXISTS "p95_negative_decel_measured" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "p95_negative_decel_proxy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mean_brake_energy_proxy_per_km" DOUBLE PRECISION;

ALTER TABLE "VehicleDrivingImpactCurrent"
  ADD COLUMN IF NOT EXISTS "p95_negative_decel_measured" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "p95_negative_decel_proxy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mean_brake_energy_proxy_per_km" DOUBLE PRECISION;
