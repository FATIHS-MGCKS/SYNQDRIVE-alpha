-- ============================================================================
-- SynqDrive — One-time bloat reclamation for the worst-offending tables
-- ----------------------------------------------------------------------------
-- WARNING: VACUUM FULL takes an ACCESS EXCLUSIVE lock and rewrites the whole
-- table — the table is unavailable for the duration. Run ONLY in a maintenance
-- window, and TAKE A BACKUP FIRST (pg_dump). For zero-downtime, prefer pg_repack
-- (see pg-repack.sh).
--
-- Recommended order: run the retention deletes first (DataRetentionScheduler or
-- manual DELETEs), THEN reclaim, so VACUUM FULL compacts already-pruned tables.
--
--   pg_dump "$DATABASE_URL" -Fc -f /var/backups/synqdrive-$(date +%F).dump
--   psql "$DATABASE_URL" -f backend/scripts/ops/pg-reclaim-bloat.sql
-- ============================================================================

\timing on

-- Bloat hot-spots identified by the storage audit. Adjust the list to match
-- the output of pg-bloat-report.sql for your instance.
VACUUM (FULL, ANALYZE, VERBOSE) public.vehicle_trip_waypoints;
VACUUM (FULL, ANALYZE, VERBOSE) public.dimo_poll_logs;
VACUUM (FULL, ANALYZE, VERBOSE) public.vehicle_trip_tracking_runs;
VACUUM (FULL, ANALYZE, VERBOSE) public.high_mobility_stream_sync_logs;
VACUUM (FULL, ANALYZE, VERBOSE) public.high_mobility_health_sync_logs;
VACUUM (FULL, ANALYZE, VERBOSE) public.trip_repairs;
VACUUM (FULL, ANALYZE, VERBOSE) public.activity_logs;
