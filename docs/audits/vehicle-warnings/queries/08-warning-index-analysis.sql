-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Index metadata for warning hot paths + EXPLAIN (without ANALYZE) for representative queries.
-- Scope: Read-only catalog queries and plan inspection only.
-- Expected: Confirm presence of partial uniques and composite (org, status) indexes (PA-11).
-- organizationId scope: Replace bind placeholders in EXPLAIN section.
-- UTC window: N/A.

-- ── Index inventory for warning tables ──
SELECT
  t.tablename,
  i.indexname,
  i.indexdef,
  CASE WHEN i.indexdef ILIKE '%WHERE%' THEN TRUE ELSE FALSE END AS is_partial,
  CASE
    WHEN i.indexdef ILIKE '%organization_id%' THEN TRUE
    ELSE FALSE
  END AS includes_organization_id,
  CASE
    WHEN i.indexdef ILIKE '%status%' OR i.indexdef ILIKE '%is_active%' THEN TRUE
    ELSE FALSE
  END AS includes_status
FROM pg_tables t
LEFT JOIN pg_indexes i
  ON i.schemaname = t.schemaname
 AND i.tablename = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'notifications',
    'tire_health_alerts',
    'brake_health_alerts',
    'vehicle_dtc_events',
    'vehicle_complaints',
    'dashboard_insights',
    'device_connection_episodes',
    'org_tasks',
    'misuse_cases'
  )
ORDER BY t.tablename, i.indexname;

-- ── Foreign keys on warning tables (cascade behavior) ──
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
 AND tc.table_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
 AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'notifications',
    'tire_health_alerts',
    'brake_health_alerts',
    'vehicle_dtc_events',
    'vehicle_complaints',
    'dashboard_insights',
    'device_connection_episodes',
    'vehicles'
  )
ORDER BY tc.table_name, kcu.column_name;

-- ── EXPLAIN plans (no ANALYZE — safe read-only) ──
-- Replace :organization_id with a real UUID when running in audit environment.

EXPLAIN (FORMAT TEXT)
SELECT id, severity, condition_code, last_seen_at
FROM notifications
WHERE organization_id = :organization_id
  AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
  AND domain = 'VEHICLE_HEALTH'
ORDER BY last_seen_at DESC
LIMIT 50;

EXPLAIN (FORMAT TEXT)
SELECT id, alert_type, severity, last_seen_at
FROM tire_health_alerts
WHERE organization_id = :organization_id
  AND status = 'OPEN'
ORDER BY last_seen_at DESC
LIMIT 50;

EXPLAIN (FORMAT TEXT)
SELECT id, dtc_code, severity, last_seen_at
FROM vehicle_dtc_events
WHERE vehicle_id = :vehicle_id
  AND is_active = TRUE
ORDER BY last_seen_at DESC;

EXPLAIN (FORMAT TEXT)
SELECT id, type, dedupe_key, updated_at
FROM dashboard_insights
WHERE organization_id = :organization_id
  AND is_active = TRUE
ORDER BY updated_at DESC
LIMIT 50;

EXPLAIN (FORMAT TEXT)
SELECT id, status, opened_at, resolved_at
FROM device_connection_episodes
WHERE organization_id = :organization_id
  AND vehicle_id = :vehicle_id
  AND status = 'OPEN';

-- Index usage stats (requires pg_stat_user_indexes — read-only)
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN (
    'notifications',
    'tire_health_alerts',
    'brake_health_alerts',
    'vehicle_dtc_events',
    'dashboard_insights',
    'device_connection_episodes'
  )
ORDER BY relname, idx_scan DESC;
