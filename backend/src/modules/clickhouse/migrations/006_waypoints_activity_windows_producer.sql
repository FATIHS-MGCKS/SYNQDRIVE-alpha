-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 006
-- Waypoint mirror + trip activity window producer columns
-- ============================================================================
--
-- PURPOSE
--   Additive columns for post-trip evidence producers:
--     - telemetry_waypoints: booking_id, quality (route replay mirror)
--     - trip_activity_windows: org/trip context + typed activity evidence
--
-- SAFETY
--   - ADD COLUMN IF NOT EXISTS only — no drops, no ORDER BY changes.
--   - PostgreSQL remains canonical trip truth; these tables are analytics only.
-- ============================================================================

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS booking_id Nullable(String) AFTER trip_id;

ALTER TABLE synqdrive.telemetry_waypoints
    ADD COLUMN IF NOT EXISTS quality LowCardinality(String) DEFAULT 'normalized' AFTER provider;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS trip_id Nullable(String) AFTER org_id;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS booking_id Nullable(String) AFTER trip_id;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS activity_type LowCardinality(String) DEFAULT 'trip_summary' AFTER booking_id;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS confidence LowCardinality(String) DEFAULT 'MEDIUM' AFTER has_activity;

ALTER TABLE synqdrive.trip_activity_windows
    ADD COLUMN IF NOT EXISTS evidence_source LowCardinality(String) DEFAULT 'unknown' AFTER confidence;
