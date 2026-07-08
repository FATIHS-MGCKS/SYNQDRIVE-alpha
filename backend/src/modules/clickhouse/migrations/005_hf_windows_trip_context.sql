-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 005
-- HF windows: trip context + coverage metadata (additive only)
-- ============================================================================
--
-- Extends telemetry_hf_windows so post-trip window aggregates can be queried
-- by trip_id and carry read-only coverage/stats for Signal Quality diagnostics.
-- No existing column is modified or dropped.
-- ============================================================================

ALTER TABLE synqdrive.telemetry_hf_windows
  ADD COLUMN IF NOT EXISTS trip_id Nullable(String);

ALTER TABLE synqdrive.telemetry_hf_windows
  ADD COLUMN IF NOT EXISTS booking_id Nullable(String);

ALTER TABLE synqdrive.telemetry_hf_windows
  ADD COLUMN IF NOT EXISTS coverage LowCardinality(String) DEFAULT 'unknown';

ALTER TABLE synqdrive.telemetry_hf_windows
  ADD COLUMN IF NOT EXISTS stats_json String DEFAULT '{}';
