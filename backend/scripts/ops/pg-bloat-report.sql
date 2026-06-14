-- ============================================================================
-- SynqDrive — PostgreSQL bloat & size report
-- ----------------------------------------------------------------------------
-- READ-ONLY. Run on the VPS Postgres to see which tables consume the most disk
-- and which carry the most dead-tuple bloat (candidates for VACUUM FULL / pg_repack).
--
--   psql "$DATABASE_URL" -f backend/scripts/ops/pg-bloat-report.sql
-- ============================================================================

-- 1) Largest relations by total size (table + indexes + TOAST)
SELECT
  n.nspname                                            AS schema,
  c.relname                                            AS table,
  pg_size_pretty(pg_total_relation_size(c.oid))        AS total_size,
  pg_size_pretty(pg_relation_size(c.oid))              AS table_size,
  pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS index_toast_size,
  c.reltuples::bigint                                  AS est_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 30;

-- 2) Dead-tuple bloat: tables with the most dead rows relative to live rows.
--    A high dead_ratio (and large n_dead_tup) on a big table => good VACUUM FULL
--    / pg_repack candidate. (autovacuum normally keeps this low.)
SELECT
  relname                                              AS table,
  n_live_tup                                           AS live_rows,
  n_dead_tup                                           AS dead_rows,
  CASE WHEN n_live_tup > 0
       THEN round(100.0 * n_dead_tup / n_live_tup, 1)
       ELSE NULL END                                   AS dead_ratio_pct,
  last_autovacuum,
  last_vacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 30;
