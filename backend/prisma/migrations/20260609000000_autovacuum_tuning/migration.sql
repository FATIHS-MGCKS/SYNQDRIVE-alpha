-- Autovacuum tuning for high-churn tables
-- ----------------------------------------------------------------------------
-- These tables are append-heavy (logs/runs), delete+recreate heavy (waypoints),
-- or upsert-heavy (latest state). With Postgres' default autovacuum_*_scale_factor
-- (0.2 = 20% of the table must turn to dead tuples before a vacuum), large tables
-- accumulate significant bloat between vacuums. We lower the thresholds so vacuum
-- runs far more often (after a small absolute number of dead rows), and raise the
-- vacuum cost limit so each run finishes quickly.
--
-- These are per-table storage parameters only: no data is changed, the operation
-- takes a brief lock, and every setting is reversible via `ALTER TABLE ... RESET (...)`.
-- fillfactor changes apply to newly written pages going forward (a later
-- VACUUM FULL / pg_repack fully rewrites with the new fillfactor).

-- Append-heavy operational logs / runs ---------------------------------------
ALTER TABLE "dimo_poll_logs" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);

ALTER TABLE "vehicle_trip_tracking_runs" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);

ALTER TABLE "high_mobility_stream_sync_logs" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);

ALTER TABLE "high_mobility_health_sync_logs" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);

ALTER TABLE "trip_repairs" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE "activity_logs" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05
);

-- Delete + recreate heavy (route geometry) -----------------------------------
ALTER TABLE "vehicle_trip_waypoints" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 3000
);

-- Upsert-heavy latest-state (1 row/vehicle, updated every snapshot tick) ------
-- Lower fillfactor leaves room on each page for HOT updates, which avoids index
-- bloat and reduces churn for in-place updates.
ALTER TABLE "vehicle_latest_states" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 200,
  autovacuum_analyze_scale_factor = 0.10,
  fillfactor = 90
);
