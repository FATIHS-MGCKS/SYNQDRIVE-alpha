-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Inventory warning-related tables, columns, constraints, and indexes from catalog metadata.
-- Scope: Read-only metadata (information_schema / pg_catalog).
-- Expected: List of tables matching warning/health/alert/finding patterns with org_id presence.
-- organizationId scope: N/A (catalog query).
-- UTC window: N/A.

WITH warning_tables AS (
  SELECT unnest(ARRAY[
    'vehicle_complaints',
    'vehicle_dtc_events',
    'vehicle_damages',
    'vehicle_latest_states',
    'vehicle_service_events',
    'booking_handover_protocols',
    'booking_eligibility_decisions',
    'tire_health_alerts',
    'brake_health_alerts',
    'brake_health_current',
    'brake_health_snapshots',
    'brake_evidence',
    'battery_evidence',
    'battery_features',
    'hv_battery_health_current',
    'hv_battery_health_snapshots',
    'battery_health_snapshots',
    'tire_health_snapshots',
    'device_connection_episodes',
    'dimo_device_connection_events',
    'device_connection_webhook_inbox',
    'device_connection_episode_lifecycle_audits',
    'dashboard_insights',
    'dashboard_insight_runs',
    'notifications',
    'notification_occurrences',
    'notification_receipts',
    'notification_delivery_outbox',
    'org_tasks',
    'service_cases',
    'misuse_cases',
    'misuse_case_evidence',
    'hm_latest_health_states',
    'hm_latest_telemetry_states',
    'dimo_poll_logs',
    'analytics_cache',
    'rental_rule_revisions',
    'org_workflow_runs',
    'task_automation_outbox'
  ]) AS table_name
),
columns AS (
  SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default
  FROM information_schema.columns c
  INNER JOIN warning_tables wt ON wt.table_name = c.table_name
  WHERE c.table_schema = 'public'
),
org_column AS (
  SELECT
    table_name,
    MAX(CASE WHEN column_name = 'organization_id' THEN is_nullable END) AS org_id_nullable
  FROM columns
  GROUP BY table_name
)
SELECT
  wt.table_name,
  oc.org_id_nullable,
  CASE
    WHEN oc.org_id_nullable IS NULL THEN 'MISSING'
    WHEN oc.org_id_nullable = 'NO' THEN 'REQUIRED'
    ELSE 'NULLABLE'
  END AS organization_id_status,
  (
    SELECT COUNT(*)
    FROM columns c2
    WHERE c2.table_name = wt.table_name
  ) AS column_count,
  (
    SELECT COUNT(*)
    FROM pg_indexes pi
    WHERE pi.schemaname = 'public'
      AND pi.tablename = wt.table_name
  ) AS index_count
FROM warning_tables wt
LEFT JOIN org_column oc ON oc.table_name = wt.table_name
ORDER BY wt.table_name;

-- Detail: timestamp / dedup columns per table
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'vehicle_complaints',
    'vehicle_dtc_events',
    'vehicle_damages',
    'vehicle_latest_states',
    'tire_health_alerts',
    'brake_health_alerts',
    'notifications',
    'dashboard_insights',
    'device_connection_episodes',
    'misuse_cases',
    'org_tasks',
    'booking_eligibility_decisions'
  )
  AND (
    c.column_name ILIKE '%at'
    OR c.column_name ILIKE '%dedup%'
    OR c.column_name ILIKE '%fingerprint%'
    OR c.column_name = 'status'
    OR c.column_name = 'is_active'
  )
ORDER BY c.table_name, c.column_name;

-- Partial unique indexes (dedup / active lifecycle)
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND (
    i.indexdef ILIKE '%WHERE%'
    OR i.tablename IN (SELECT table_name FROM warning_tables)
  )
  AND (
    i.indexdef ILIKE '%dedup%'
    OR i.indexdef ILIKE '%fingerprint%'
    OR i.indexdef ILIKE '%is_active%'
    OR i.indexdef ILIKE '%status%'
    OR i.tablename IN (
      'notifications',
      'tire_health_alerts',
      'brake_health_alerts',
      'dashboard_insights',
      'vehicle_dtc_events',
      'vehicle_complaints'
    )
  )
ORDER BY i.tablename, i.indexname;
