-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 004
-- telemetry_waypoints provenance columns
-- ============================================================================
--
-- PURPOSE
--   Extend the existing telemetry_waypoints route-replay mirror with provenance
--   columns (org, source/provider, token) so HF waypoint persistence is
--   tenant-attributable and traceable, matching telemetry_hf_points.
--
-- ARCHITECTURE / SAFETY
--   - Additive only. ADD COLUMN IF NOT EXISTS — safe to run repeatedly and on a
--     populated table. No existing column is modified or dropped.
--   - PostgreSQL stays the canonical truth. This remains an analytics mirror.
--   - trip_id already exists from migration 001.
--   - ORDER BY / PARTITION BY are intentionally left unchanged (vehicle_id,
--     recorded_at) — provenance columns are attributes, not sort keys.
-- ============================================================================

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS org_id   String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS token_id UInt32 DEFAULT 0 AFTER org_id;

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS source   LowCardinality(String) DEFAULT 'unknown' AFTER token_id;

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS provider LowCardinality(String) DEFAULT 'unknown' AFTER source;
