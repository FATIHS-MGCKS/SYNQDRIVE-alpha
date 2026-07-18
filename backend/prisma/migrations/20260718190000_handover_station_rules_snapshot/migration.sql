-- Handover-time station rules audit on protocols.
ALTER TABLE "booking_handover_protocols" ADD COLUMN "actual_station_id" UUID;
ALTER TABLE "booking_handover_protocols" ADD COLUMN "station_rules_snapshot" JSONB;

-- Extend manual override reference types for handover pickup/return.
ALTER TYPE "StationRuleManualOverrideReferenceType" ADD VALUE IF NOT EXISTS 'HANDOVER_PICKUP';
ALTER TYPE "StationRuleManualOverrideReferenceType" ADD VALUE IF NOT EXISTS 'HANDOVER_RETURN';
