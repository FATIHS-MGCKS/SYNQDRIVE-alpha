-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 001 (Initial)
-- ============================================================================
--
-- These tables form the telemetry analytics backbone used by analytical
-- detectors and the reconciliation/repair layer.
--
-- ARCHITECTURE NOTES:
--   - All tables are append-only mirrors. Operational truth lives in PostgreSQL.
--   - Writes are fire-and-forget (best-effort); failures never block the FSM.
--   - ReplacingMergeTree is used where idempotency on re-insert matters.
--   - Partitioning by month keeps compaction manageable.
--
-- Run order: 001 → sequential; safe to run multiple times (CREATE IF NOT EXISTS).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS synqdrive;

-- ---------------------------------------------------------------------------
-- 1. telemetry_snapshots
--    Raw snapshot mirror from DIMO, one row per poll cycle per vehicle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_snapshots (
    vehicle_id        String,
    token_id          UInt32,
    recorded_at       DateTime64(3, 'UTC'),
    is_ignition_on    Nullable(UInt8),      -- 0 / 1 / NULL
    speed_kmh         Nullable(Float32),
    odometer_km       Nullable(Float64),
    latitude          Nullable(Float64),
    longitude         Nullable(Float64),
    engine_load       Nullable(Float32),
    fuel_absolute     Nullable(Float32),
    ev_soc            Nullable(Float32),
    traction_kw       Nullable(Float32)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (vehicle_id, recorded_at)
TTL recorded_at + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 2. telemetry_state_changes
--    Derived ignition/motion transition events from consecutive snapshots.
--    Used by IgnitionSegmentDetector to find trip candidate windows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_state_changes (
    vehicle_id    String,
    changed_at    DateTime64(3, 'UTC'),
    signal_name   LowCardinality(String),   -- 'ignition' | 'motion'
    old_value     Nullable(Int8),
    new_value     Nullable(Int8)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(changed_at)
ORDER BY (vehicle_id, signal_name, changed_at)
TTL changed_at + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 3. telemetry_waypoints
--    Optional high-resolution waypoint stream (lat/lng/speed) for route replay.
--    Populated from HF (high-frequency) DIMO data when available.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_waypoints (
    vehicle_id    String,
    recorded_at   DateTime64(3, 'UTC'),
    latitude      Float64,
    longitude     Float64,
    speed_kmh     Nullable(Float32),
    odometer_km   Nullable(Float64),
    trip_id       Nullable(String)          -- set when attributed to a known trip
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (vehicle_id, recorded_at)
TTL recorded_at + INTERVAL 6 MONTH
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 4. trip_activity_windows
--    Analytical summary of vehicle activity per computed time window.
--    Written by ActivityWindowDetector outputs for later reference.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.trip_activity_windows (
    vehicle_id          String,
    window_start        DateTime64(3, 'UTC'),
    window_end          DateTime64(3, 'UTC'),
    point_count         UInt32,
    max_speed_kmh       Nullable(Float32),
    odometer_delta_km   Nullable(Float64),
    has_activity        UInt8,              -- 0 / 1
    computed_at         DateTime64(3, 'UTC') DEFAULT now()
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(window_start)
ORDER BY (vehicle_id, window_start, window_end)
TTL window_start + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 5. trip_segment_candidates
--    Ignition segment candidates produced by IgnitionSegmentDetector.
--    Written during repair scans so results can be referenced without re-querying.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.trip_segment_candidates (
    vehicle_id      String,
    segment_start   DateTime64(3, 'UTC'),
    segment_end     DateTime64(3, 'UTC'),
    duration_ms     UInt32,
    confidence      LowCardinality(String), -- 'LOW' | 'MEDIUM' | 'HIGH'
    repair_tier     LowCardinality(String), -- 'fast' | 'warm' | 'cold'
    trip_id         Nullable(String),       -- set if a repair trip was created
    computed_at     DateTime64(3, 'UTC') DEFAULT now()
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(segment_start)
ORDER BY (vehicle_id, segment_start)
TTL segment_start + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
