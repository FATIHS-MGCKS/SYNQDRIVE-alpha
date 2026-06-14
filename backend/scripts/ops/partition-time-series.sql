-- ============================================================================
-- SynqDrive — Convert high-volume time-series tables to RANGE partitioning
-- ----------------------------------------------------------------------------
-- STATUS: REVIEWED TEMPLATE — NOT auto-applied. [NEEDS APPROVAL] [SAFE AFTER BACKUP]
--
-- Why: with monthly range partitions on created_at, retention becomes a cheap
-- `DROP TABLE <partition>` (instant, no bloat) instead of `DELETE` + VACUUM. This
-- complements the DataRetentionScheduler (which still works on partitioned tables).
--
-- Prerequisites & cautions:
--   * TAKE A BACKUP FIRST: pg_dump "$DATABASE_URL" -Fc -f backup.dump
--   * Run inside a MAINTENANCE WINDOW — the swap takes a brief exclusive lock.
--   * A partitioned table's PRIMARY KEY / UNIQUE keys must INCLUDE the partition
--     key (created_at). The candidate tables below are append-only logs with NO
--     incoming foreign keys, so widening the PK to (id, created_at) is safe.
--   * Consider `pg_partman` to automate future partition creation + retention
--     instead of the manual function at the bottom.
--
-- This script shows the full pattern for ONE table (dimo_poll_logs). The same
-- steps apply to vehicle_trip_waypoints (partition by recorded_at) and
-- activity_logs (partition by created_at) — both are children/logs with no
-- incoming FKs. Adapt column lists from the live schema before running.
-- ============================================================================

BEGIN;

-- 1) Rename the existing table out of the way.
ALTER TABLE public.dimo_poll_logs RENAME TO dimo_poll_logs_legacy;

-- 2) Create the partitioned parent. Mirror the live columns exactly (see
--    prisma/schema.prisma -> model DimoPollLog). PK must include created_at.
CREATE TABLE public.dimo_poll_logs (
  id              text       NOT NULL,
  vehicle_id      text,
  job_type        text       NOT NULL,
  status          text       NOT NULL,
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  duration_ms     integer,
  token_refreshed boolean    NOT NULL DEFAULT false,
  error_message   text,
  error_code      text,
  retry_count     integer    NOT NULL DEFAULT 0,
  meta_json       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 3) Recreate the secondary indexes on the parent (propagate to partitions).
CREATE INDEX dimo_poll_logs_vehicle_id_idx        ON public.dimo_poll_logs (vehicle_id);
CREATE INDEX dimo_poll_logs_job_type_idx          ON public.dimo_poll_logs (job_type);
CREATE INDEX dimo_poll_logs_created_at_idx         ON public.dimo_poll_logs (created_at);
CREATE INDEX dimo_poll_logs_vehicle_created_idx    ON public.dimo_poll_logs (vehicle_id, created_at);

-- 4) Create an initial set of monthly partitions covering existing + near-future
--    data. Extend the range to cover min(created_at)..now()+1 month for your data.
--    (Example: 6 past months + current + next.)
DO $$
DECLARE
  m date := date_trunc('month', now())::date - INTERVAL '6 months';
  stop date := date_trunc('month', now())::date + INTERVAL '2 months';
BEGIN
  WHILE m < stop LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.dimo_poll_logs FOR VALUES FROM (%L) TO (%L);',
      'dimo_poll_logs_' || to_char(m, 'YYYY_MM'),
      m,
      (m + INTERVAL '1 month')::date
    );
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;

-- 5) Copy data from legacy into the partitioned table (routed by created_at).
INSERT INTO public.dimo_poll_logs
SELECT id, vehicle_id, job_type, status, started_at, finished_at, duration_ms,
       token_refreshed, error_message, error_code, retry_count, meta_json, created_at
FROM public.dimo_poll_logs_legacy;

-- 6) Recreate the FK to vehicles (outgoing FK is allowed on partitioned tables).
ALTER TABLE public.dimo_poll_logs
  ADD CONSTRAINT dimo_poll_logs_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- 7) Verify counts BEFORE dropping legacy.
--    SELECT (SELECT count(*) FROM public.dimo_poll_logs)        AS new_count,
--           (SELECT count(*) FROM public.dimo_poll_logs_legacy) AS legacy_count;

-- 8) After verification, drop the legacy table (do this in a SEPARATE step once
--    counts match). Left commented intentionally:
-- DROP TABLE public.dimo_poll_logs_legacy;

COMMIT;

-- ── Ongoing partition maintenance ──────────────────────────────────────────
-- Create next month's partition ahead of time (schedule monthly, or use pg_partman).
-- CREATE TABLE IF NOT EXISTS public.dimo_poll_logs_2026_07
--   PARTITION OF public.dimo_poll_logs FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--
-- Retention by partition drop (replaces DELETE for partitioned tables):
-- DROP TABLE IF EXISTS public.dimo_poll_logs_2025_12;
