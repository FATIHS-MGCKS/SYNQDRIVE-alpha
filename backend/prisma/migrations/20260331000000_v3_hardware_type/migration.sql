-- ============================================================
-- Migration: V3 Hardware-Aware Architecture
-- Date: 2026-03-31
--
-- Changes:
--   1. Add HardwareType enum (LTE_R1, SMART5, UNKNOWN)
--   2. Add hardwareType column to vehicles table
--   3. Add DrivingEventSource enum (TELEMETRY_EVENTS, HF_DERIVED)
--   4. Add source, organization_id, metadata_json to driving_events table
-- ============================================================

-- 1. Create HardwareType enum
CREATE TYPE "HardwareType" AS ENUM ('LTE_R1', 'SMART5', 'UNKNOWN');

-- 2. Add hardwareType column to vehicles
ALTER TABLE "vehicles"
  ADD COLUMN "hardware_type" "HardwareType" NOT NULL DEFAULT 'UNKNOWN';

-- 3. Create DrivingEventSource enum
CREATE TYPE "DrivingEventSource" AS ENUM ('TELEMETRY_EVENTS', 'HF_DERIVED');

-- 4. Extend driving_events table
ALTER TABLE "driving_events"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "source" "DrivingEventSource" NOT NULL DEFAULT 'TELEMETRY_EVENTS',
  ADD COLUMN "metadata_json" JSONB;

-- 5. Index for source-based lookups (e.g. delete TELEMETRY_EVENTS on re-enrichment)
CREATE INDEX "driving_events_source_idx" ON "driving_events"("source");

-- ── Optional production backfill (NOT run automatically) ─────────────────────
-- Mark known LTE_R1 fleet vehicles after reviewing IDs (do NOT blanket-update all UNKNOWN):
--   UPDATE "vehicles" SET "hardware_type" = 'LTE_R1'::"HardwareType"
--   WHERE "id" IN ('<uuid-1>', '<uuid-2>');
-- Or use MASTER_ADMIN: POST /admin/vehicles/hardware-backfill
--   body: { "vehicleIds": ["..."], "hardwareType": "LTE_R1" }
