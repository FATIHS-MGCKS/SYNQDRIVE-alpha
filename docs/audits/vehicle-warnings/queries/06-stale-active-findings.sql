-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Find active/open findings with stale last_seen / first_seen (eventual consistency / PA-07).
-- Scope: Read-only SELECT.
-- Parameters: :organization_id (optional), :stale_threshold_hours (default 72).
-- Expected: Review list — some may be legitimately stale if vehicle offline.
-- organizationId scope: Filter via :organization_id.
-- UTC window: now() - :stale_threshold_hours.

-- Default threshold when client does not bind parameter
WITH params AS (
  SELECT COALESCE(:stale_threshold_hours::int, 72) AS stale_hours
),
cutoff AS (
  SELECT NOW() AT TIME ZONE 'UTC' - (p.stale_hours || ' hours')::interval AS ts
  FROM params p
)

-- Open tire alerts not refreshed recently
SELECT
  'tire_health_alerts' AS source,
  a.id,
  a.organization_id,
  a.vehicle_id,
  a.alert_type,
  a.severity,
  a.opened_at,
  a.last_seen_at,
  EXTRACT(EPOCH FROM (NOW() - a.last_seen_at)) / 3600 AS hours_since_last_seen
FROM tire_health_alerts a
CROSS JOIN cutoff c
WHERE a.status = 'OPEN'
  AND a.last_seen_at < c.ts
  AND (:organization_id IS NULL OR a.organization_id = :organization_id)

UNION ALL

SELECT
  'brake_health_alerts',
  a.id,
  a.organization_id,
  a.vehicle_id,
  a.alert_type,
  a.severity,
  a.opened_at,
  a.last_seen_at,
  EXTRACT(EPOCH FROM (NOW() - a.last_seen_at)) / 3600
FROM brake_health_alerts a
CROSS JOIN cutoff c
WHERE a.status = 'OPEN'
  AND a.last_seen_at < c.ts
  AND (:organization_id IS NULL OR a.organization_id = :organization_id)

UNION ALL

-- Active DTC not seen recently (vehicle may still be "active" in UI)
SELECT
  'vehicle_dtc_events',
  e.id,
  v.organization_id,
  e.vehicle_id,
  e.dtc_code,
  e.severity::text,
  e.first_seen_at,
  e.last_seen_at,
  EXTRACT(EPOCH FROM (NOW() - e.last_seen_at)) / 3600
FROM vehicle_dtc_events e
INNER JOIN vehicles v ON v.id = e.vehicle_id
CROSS JOIN cutoff c
WHERE e.is_active = TRUE
  AND e.last_seen_at < c.ts
  AND (:organization_id IS NULL OR v.organization_id = :organization_id)

UNION ALL

-- Open notifications stale
SELECT
  'notifications',
  n.id,
  n.organization_id,
  n.entity_id,
  n.condition_code,
  n.severity::text,
  n.first_seen_at,
  n.last_seen_at,
  EXTRACT(EPOCH FROM (NOW() - n.last_seen_at)) / 3600
FROM notifications n
CROSS JOIN cutoff c
WHERE n.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
  AND n.last_seen_at < c.ts
  AND (:organization_id IS NULL OR n.organization_id = :organization_id)

UNION ALL

-- Active dashboard insights not updated
SELECT
  'dashboard_insights',
  di.id,
  di.organization_id,
  di.type::text,
  di.dedupe_key,
  di.severity::text,
  di.created_at,
  di.updated_at,
  EXTRACT(EPOCH FROM (NOW() - di.updated_at)) / 3600
FROM dashboard_insights di
CROSS JOIN cutoff c
WHERE di.is_active = TRUE
  AND di.updated_at < c.ts
  AND (:organization_id IS NULL OR di.organization_id = :organization_id)

UNION ALL

-- Open connectivity episodes (long-running unplug)
SELECT
  'device_connection_episodes',
  e.id,
  e.organization_id,
  e.vehicle_id,
  e.opened_reason::text,
  e.status::text,
  e.opened_at,
  e.updated_at,
  EXTRACT(EPOCH FROM (NOW() - e.opened_at)) / 3600
FROM device_connection_episodes e
CROSS JOIN cutoff c
WHERE e.status = 'OPEN'
  AND e.opened_at < c.ts
  AND (:organization_id IS NULL OR e.organization_id = :organization_id)

ORDER BY hours_since_last_seen DESC NULLS LAST;
