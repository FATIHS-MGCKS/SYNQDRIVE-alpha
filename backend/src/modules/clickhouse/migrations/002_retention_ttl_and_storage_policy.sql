-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 002
-- Retention / TTL + storage policy (Phase 1)
-- ============================================================================
--
-- PURPOSE
--   Protect the optional analytics/telemetry mirror against unbounded growth on
--   small self-hosted VPS hosts by enforcing explicit per-table retention (TTL).
--
-- SAFETY
--   - PostgreSQL stays the canonical truth and is NOT touched by this migration.
--   - No table is dropped. No column is dropped. No data is deleted by this
--     migration directly — ClickHouse evaluates the new TTL in the background and
--     removes only rows older than the configured retention going forward.
--   - Only `ALTER TABLE ... MODIFY TTL` is used (additive / metadata change).
--
-- TTL FIELD SELECTION (verified against 001_initial_schema.sql)
--   Each TTL points at the table's real EVENT/RECORDED timestamp column, never a
--   surrogate ingestion/created column:
--     telemetry_snapshots      -> recorded_at   (event time of the poll snapshot)
--     telemetry_state_changes  -> changed_at    (when the signal transition happened)
--     telemetry_waypoints      -> recorded_at   (waypoint sample time)
--     trip_activity_windows    -> window_start  (start of the analytical window)
--     trip_segment_candidates  -> segment_start (start of the ignition segment)
--   None of these tables has an org_id/created_at/ingested_at column, so no such
--   surrogate field is used.
--
-- PARTITIONING / ORDER BY (Phase 1 assessment — verified against 001)
--   All five tables are ALREADY partitioned monthly by their event time
--   (PARTITION BY toYYYYMM(<event_time>)) and ordered as (vehicle_id, <time>...),
--   which is sufficient for retention pruning and vehicle/time-scoped reads.
--   ClickHouse does NOT allow changing PARTITION BY or ORDER BY via simple ALTER,
--   and there is no org_id column on these mirror tables today. Therefore:
--     - Phase 1 only adjusts TTL via ALTER (safe, no data migration).
--     - Any future change to the partition key or to a tenant-leading sort key
--       (e.g. (org_id, vehicle_id, recorded_at)) would require creating new
--       tables and a controlled data migration — intentionally OUT OF SCOPE here.
--
-- Retention (Phase 1):
--   telemetry_snapshots      180 days
--   telemetry_waypoints      365 days
--   telemetry_state_changes  365 days
--   trip_activity_windows    365 days
--   trip_segment_candidates  180 days
-- ============================================================================

-- telemetry_snapshots: high-volume raw mirror -> 180 days.
ALTER TABLE synqdrive.telemetry_snapshots
    MODIFY TTL recorded_at + INTERVAL 180 DAY;

-- telemetry_state_changes: derived transitions, lower volume -> 365 days.
ALTER TABLE synqdrive.telemetry_state_changes
    MODIFY TTL changed_at + INTERVAL 365 DAY;

-- telemetry_waypoints: route replay points -> 365 days.
ALTER TABLE synqdrive.telemetry_waypoints
    MODIFY TTL recorded_at + INTERVAL 365 DAY;

-- trip_activity_windows: analytical summaries -> 365 days.
ALTER TABLE synqdrive.trip_activity_windows
    MODIFY TTL window_start + INTERVAL 365 DAY;

-- trip_segment_candidates: repair-scan candidates -> 180 days.
ALTER TABLE synqdrive.trip_segment_candidates
    MODIFY TTL segment_start + INTERVAL 180 DAY;
