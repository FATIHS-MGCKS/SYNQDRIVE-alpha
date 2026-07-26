-- ============================================================================
-- SynqDrive ClickHouse Analytics Schema — Migration 007
-- Legacy mirror tables: additive org_id columns (tenant isolation prep)
-- ============================================================================
--
-- PURPOSE (Phase 2D.4)
--   Add org_id to high-volume legacy tables that predate HF tenant columns.
--   Enables backfill from PostgreSQL vehicles.organization_id and future
--   org_id predicates in analytics queries.
--
-- SAFETY
--   - ADD COLUMN IF NOT EXISTS only — no drops, no PARTITION BY / ORDER BY change.
--   - Existing rows receive DEFAULT '' until backfill (2D.5 ops script).
--   - PostgreSQL remains canonical truth.
--
-- NOT APPLIED until deployed via ClickHouseSchemaService bootstrap.
-- ============================================================================

ALTER TABLE synqdrive.telemetry_snapshots
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.telemetry_state_changes
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.trip_segment_candidates
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;
