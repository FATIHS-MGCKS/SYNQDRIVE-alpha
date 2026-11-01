-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Detect duplicate OPEN findings for the same vehicle + logical condition.
-- Scope: Read-only SELECT. Parameterize :organization_id and optional :vehicle_id in client.
-- Expected: Zero rows in a healthy system; non-zero rows indicate PA-03.
-- organizationId scope: Filter via :organization_id where available.
-- UTC window: N/A (current state snapshot).

-- ── Tire health alerts: multiple OPEN rows sharing dedupe_key prefix (vehicle + alert_type) ──
WITH tire_open AS (
  SELECT
    organization_id,
    vehicle_id,
    tire_setup_id,
    alert_type,
    dedupe_key,
    COUNT(*) AS open_count
  FROM tire_health_alerts
  WHERE status = 'OPEN'
    AND (:organization_id IS NULL OR organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR vehicle_id = :vehicle_id)
  GROUP BY organization_id, vehicle_id, tire_setup_id, alert_type, dedupe_key
  HAVING COUNT(*) > 1
)
SELECT 'tire_health_alerts' AS source, * FROM tire_open;

-- ── Brake health alerts: duplicate OPEN dedupe_key (should be impossible via partial unique) ──
WITH brake_open AS (
  SELECT
    organization_id,
    vehicle_id,
    alert_type,
    category,
    dedupe_key,
    COUNT(*) AS open_count
  FROM brake_health_alerts
  WHERE status = 'OPEN'
    AND (:organization_id IS NULL OR organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR vehicle_id = :vehicle_id)
  GROUP BY organization_id, vehicle_id, alert_type, category, dedupe_key
  HAVING COUNT(*) > 1
)
SELECT 'brake_health_alerts' AS source, * FROM brake_open;

-- ── DTC: multiple ACTIVE rows for same vehicle + code (no DB unique — PA-03) ──
WITH dtc_active_dup AS (
  SELECT
    v.organization_id,
    e.vehicle_id,
    e.dtc_code,
    COUNT(*) AS active_count,
    ARRAY_AGG(e.id ORDER BY e.last_seen_at DESC) AS event_ids
  FROM vehicle_dtc_events e
  INNER JOIN vehicles v ON v.id = e.vehicle_id
  WHERE e.is_active = TRUE
    AND (:organization_id IS NULL OR v.organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR e.vehicle_id = :vehicle_id)
  GROUP BY v.organization_id, e.vehicle_id, e.dtc_code
  HAVING COUNT(*) > 1
)
SELECT 'vehicle_dtc_events' AS source, * FROM dtc_active_dup;

-- ── Dashboard insights: multiple active rows per dedupe_key (no partial unique — PA-03) ──
WITH insight_active_dup AS (
  SELECT
    organization_id,
    dedupe_key,
    type,
    COUNT(*) AS active_count,
    ARRAY_AGG(id ORDER BY updated_at DESC) AS insight_ids
  FROM dashboard_insights
  WHERE is_active = TRUE
    AND (:organization_id IS NULL OR organization_id = :organization_id)
  GROUP BY organization_id, dedupe_key, type
  HAVING COUNT(*) > 1
)
SELECT 'dashboard_insights' AS source, * FROM insight_active_dup;

-- ── Notifications: multiple active rows per fingerprint+generation (partial unique should prevent) ──
WITH notif_active_dup AS (
  SELECT
    organization_id,
    fingerprint,
    lifecycle_generation,
    COUNT(*) AS active_count
  FROM notifications
  WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
    AND (:organization_id IS NULL OR organization_id = :organization_id)
  GROUP BY organization_id, fingerprint, lifecycle_generation
  HAVING COUNT(*) > 1
)
SELECT 'notifications' AS source, * FROM notif_active_dup;

-- ── Parallel domain alerts: same vehicle, multiple OPEN connectivity episodes ──
WITH conn_open AS (
  SELECT
    organization_id,
    vehicle_id,
    provider,
    COUNT(*) AS open_episode_count
  FROM device_connection_episodes
  WHERE status = 'OPEN'
    AND (:organization_id IS NULL OR organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR vehicle_id = :vehicle_id)
  GROUP BY organization_id, vehicle_id, provider
  HAVING COUNT(*) > 1
)
SELECT 'device_connection_episodes' AS source, * FROM conn_open;
