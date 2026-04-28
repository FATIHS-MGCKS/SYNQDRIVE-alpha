-- V4.6.83 — Canonicalize scoring: add rolling safetyScore to VehicleDrivingImpactCurrent.
-- Additive, nullable. Existing rows remain valid; field is populated on the
-- next trip impact computation per vehicle via DrivingImpactService.updateRollingCurrent.

ALTER TABLE "vehicle_driving_impact_current"
  ADD COLUMN IF NOT EXISTS "safety_score" DOUBLE PRECISION;
