-- Migration: High Mobility Phase 3 — Signal Group State table
-- Purpose: Cache normalized HM signal data per vehicle per signal group for
--          freshness tracking and selective UI integration (Service, Tire Pressure, AI Health Care).

-- Create enum for signal groups
CREATE TYPE "HmSignalGroup" AS ENUM ('SERVICE', 'TIRE_PRESSURE', 'AI_HEALTH_CARE');

-- Create signal group state table
CREATE TABLE "hm_signal_group_states" (
    "id"                VARCHAR NOT NULL,
    "vehicle_id"        VARCHAR NOT NULL,
    "hm_vehicle_id"     VARCHAR NOT NULL,
    "signal_group"      "HmSignalGroup" NOT NULL,
    "last_fetched_at"   TIMESTAMP(3),
    "last_success_at"   TIMESTAMP(3),
    "last_error_at"     TIMESTAMP(3),
    "last_error_message" TEXT,
    "data_json"         JSONB,
    "fetch_count"       INTEGER NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hm_signal_group_states_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one state record per vehicle per signal group
ALTER TABLE "hm_signal_group_states"
    ADD CONSTRAINT "uq_signal_group_vehicle" UNIQUE ("vehicle_id", "signal_group");

-- FK to high_mobility_vehicles
ALTER TABLE "hm_signal_group_states"
    ADD CONSTRAINT "hm_signal_group_states_hm_vehicle_id_fkey"
    FOREIGN KEY ("hm_vehicle_id")
    REFERENCES "high_mobility_vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for query performance
CREATE INDEX "hm_signal_group_states_vehicle_id_idx" ON "hm_signal_group_states"("vehicle_id");
CREATE INDEX "hm_signal_group_states_hm_vehicle_id_idx" ON "hm_signal_group_states"("hm_vehicle_id");
CREATE INDEX "hm_signal_group_states_signal_group_idx" ON "hm_signal_group_states"("signal_group");
