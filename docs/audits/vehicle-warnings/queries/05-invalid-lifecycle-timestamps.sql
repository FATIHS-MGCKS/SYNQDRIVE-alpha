-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Detect lifecycle timestamp inconsistencies (PA-05, PA-12).
-- Scope: Read-only SELECT.
-- Expected: Zero rows for strict invariants; review exceptions manually.
-- organizationId scope: Optional :organization_id.
-- UTC window: N/A.

-- ── Tire alerts: RESOLVED without resolved_at ──
SELECT
  'tire_health_alerts' AS source,
  id,
  organization_id,
  vehicle_id,
  status,
  opened_at,
  resolved_at,
  last_seen_at
FROM tire_health_alerts
WHERE status = 'RESOLVED'
  AND resolved_at IS NULL
  AND (:organization_id IS NULL OR organization_id = :organization_id)

UNION ALL

-- OPEN with resolved_at set (stale column)
SELECT
  'tire_health_alerts',
  id,
  organization_id,
  vehicle_id,
  status,
  opened_at,
  resolved_at,
  last_seen_at
FROM tire_health_alerts
WHERE status = 'OPEN'
  AND resolved_at IS NOT NULL
  AND (:organization_id IS NULL OR organization_id = :organization_id);

-- ── Brake alerts: same checks ──
SELECT
  'brake_health_alerts' AS source,
  id,
  organization_id,
  vehicle_id,
  status::text,
  opened_at,
  resolved_at,
  last_seen_at
FROM brake_health_alerts
WHERE (
    (status = 'RESOLVED' AND resolved_at IS NULL)
    OR (status = 'OPEN' AND resolved_at IS NOT NULL)
  )
  AND (:organization_id IS NULL OR organization_id = :organization_id);

-- ── DTC: active but cleared_at set, or inactive without cleared_at ──
SELECT
  'vehicle_dtc_events' AS source,
  e.id,
  v.organization_id,
  e.vehicle_id,
  e.is_active::text AS status,
  e.first_seen_at AS opened_at,
  e.cleared_at AS resolved_at,
  e.last_seen_at
FROM vehicle_dtc_events e
INNER JOIN vehicles v ON v.id = e.vehicle_id
WHERE (
    (e.is_active = TRUE AND e.cleared_at IS NOT NULL)
    OR (e.is_active = FALSE AND e.cleared_at IS NULL)
  )
  AND (:organization_id IS NULL OR v.organization_id = :organization_id);

-- ── Notifications: RESOLVED/ARCHIVED without resolved_at ──
SELECT
  'notifications' AS source,
  id,
  organization_id,
  entity_id AS vehicle_id,
  status::text,
  first_seen_at AS opened_at,
  resolved_at,
  last_seen_at
FROM notifications
WHERE status IN ('RESOLVED', 'ARCHIVED')
  AND resolved_at IS NULL
  AND (:organization_id IS NULL OR organization_id = :organization_id)

UNION ALL

SELECT
  'notifications',
  id,
  organization_id,
  entity_id,
  status::text,
  first_seen_at,
  resolved_at,
  last_seen_at
FROM notifications
WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
  AND resolved_at IS NOT NULL
  AND (:organization_id IS NULL OR organization_id = :organization_id);

-- ── Complaints: resolved/dismissed timestamp coherence ──
SELECT
  'vehicle_complaints' AS source,
  id,
  organization_id,
  vehicle_id,
  status::text,
  created_at AS opened_at,
  resolved_at,
  dismissed_at AS last_seen_at
FROM vehicle_complaints
WHERE (
    (status IN ('RESOLVED', 'CONVERTED') AND resolved_at IS NULL AND dismissed_at IS NULL)
    OR (status = 'DISMISSED' AND dismissed_at IS NULL)
    OR (status = 'ACTIVE' AND (resolved_at IS NOT NULL OR dismissed_at IS NOT NULL))
  )
  AND (:organization_id IS NULL OR organization_id = :organization_id);

-- ── Connectivity episodes: OPEN with resolved_at ──
SELECT
  'device_connection_episodes' AS source,
  id,
  organization_id,
  vehicle_id,
  status::text,
  opened_at,
  resolved_at,
  updated_at AS last_seen_at
FROM device_connection_episodes
WHERE (
    (status = 'OPEN' AND resolved_at IS NOT NULL)
    OR (status = 'RESOLVED' AND resolved_at IS NULL)
  )
  AND (:organization_id IS NULL OR organization_id = :organization_id);

-- ── Temporal ordering: last_seen before opened (data clock issues) ──
SELECT
  'tire_health_alerts_order' AS source,
  id,
  organization_id,
  vehicle_id,
  opened_at,
  last_seen_at
FROM tire_health_alerts
WHERE last_seen_at < opened_at
  AND (:organization_id IS NULL OR organization_id = :organization_id)

UNION ALL

SELECT
  'notifications_order',
  id,
  organization_id,
  entity_id,
  first_seen_at,
  last_seen_at
FROM notifications
WHERE last_seen_at < first_seen_at
  AND (:organization_id IS NULL OR organization_id = :organization_id);
