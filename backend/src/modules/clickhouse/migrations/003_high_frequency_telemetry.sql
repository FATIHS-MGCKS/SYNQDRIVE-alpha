-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 003
-- High-Frequency (HF) DIMO telemetry foundation
-- ============================================================================
--
-- PURPOSE
--   Create the ClickHouse-only foundation to ingest high-frequency telemetry
--   (normalized signal points), aggregated time windows, and derived events.
--
-- ARCHITECTURE / SAFETY
--   - Analytics-only mirror. PostgreSQL stays the canonical truth.
--   - No second source of truth. No Prisma model mirrors these tables.
--   - These tables are additive — no existing table is modified or dropped.
--   - HF ingestion is best-effort; an HF/ClickHouse outage must never block any
--     operational SynqDrive flow (trips, bookings, rental, health, damages).
--   - Append-only (MergeTree) for raw points; ReplacingMergeTree for the
--     idempotent aggregate/event tables so re-computation is safe.
--
-- Retention (Phase 1):
--   telemetry_hf_points    90 days   (high-volume raw/normalized signal stream)
--   telemetry_hf_windows   180 days  (aggregated windows)
--   telemetry_hf_events    365 days  (derived events)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. telemetry_hf_points
--    Generic, normalized HF time-series point per vehicle, signal and time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_hf_points (
    org_id        String,
    vehicle_id    String,
    token_id      UInt32,
    source        LowCardinality(String),          -- e.g. 'dimo'
    signal_name   LowCardinality(String),
    signal_group  LowCardinality(String),          -- gps | speed | powertrain | battery | charging | brake | tire | environment | unknown
    recorded_at   DateTime64(3, 'UTC'),
    ingested_at   DateTime64(3, 'UTC') DEFAULT now64(3),
    value_float   Nullable(Float64),
    value_int     Nullable(Int64),
    value_bool    Nullable(UInt8),
    value_string  Nullable(String),
    unit          Nullable(String),
    quality       LowCardinality(String),          -- raw | normalized | estimated | invalid
    request_id    Nullable(String),
    trip_id       Nullable(String),
    booking_id    Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (org_id, vehicle_id, signal_name, recorded_at)
TTL recorded_at + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 2. telemetry_hf_windows
--    Aggregated HF windows so later UI/API does not scan raw points each time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_hf_windows (
    org_id                  String,
    vehicle_id              String,
    window_start            DateTime64(3, 'UTC'),
    window_end              DateTime64(3, 'UTC'),
    signal_group            LowCardinality(String),
    point_count             UInt32,
    sample_interval_min_ms  Nullable(UInt32),
    sample_interval_max_ms  Nullable(UInt32),
    sample_interval_avg_ms  Nullable(Float32),
    max_speed_kmh           Nullable(Float32),
    max_accel_mps2          Nullable(Float32),
    min_accel_mps2          Nullable(Float32),
    max_traction_kw         Nullable(Float32),
    min_traction_kw         Nullable(Float32),
    soc_delta_pct           Nullable(Float32),
    gps_point_count         UInt32,
    missing_gap_count       UInt32,
    largest_gap_ms          Nullable(UInt32),
    computed_at             DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(window_start)
ORDER BY (org_id, vehicle_id, window_start, signal_group)
TTL window_start + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 3. telemetry_hf_events
--    Events derived from HF data (harsh accel/braking, gaps, charging, etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synqdrive.telemetry_hf_events (
    org_id        String,
    vehicle_id    String,
    event_type    LowCardinality(String),          -- HARSH_ACCELERATION | HARSH_BRAKING | LAUNCH_LIKE_START | SPEED_SPIKE | GPS_GAP | SIGNAL_GAP | CHARGING_SESSION_SIGNAL
    severity      LowCardinality(String),          -- info | watch | warning | critical
    event_start   DateTime64(3, 'UTC'),
    event_end     Nullable(DateTime64(3, 'UTC')),
    duration_ms   Nullable(UInt32),
    confidence    LowCardinality(String),          -- low | medium | high
    primary_value Nullable(Float64),
    primary_unit  Nullable(String),
    evidence_json String,
    trip_id       Nullable(String),
    booking_id    Nullable(String),
    computed_at   DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(event_start)
ORDER BY (org_id, vehicle_id, event_type, event_start)
TTL event_start + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;
