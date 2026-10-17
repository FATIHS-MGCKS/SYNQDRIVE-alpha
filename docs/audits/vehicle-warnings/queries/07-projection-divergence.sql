-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Compare counts across parallel projection layers per vehicle (PA-13, MT-03).
-- Scope: Read-only SELECT aggregation.
-- Expected: Divergence highlights multi-truth surfaces; not all deltas are bugs.
-- organizationId scope: :organization_id required for production sampling.
-- UTC window: N/A.

WITH vehicle_scope AS (
  SELECT v.id AS vehicle_id, v.organization_id
  FROM vehicles v
  WHERE (:organization_id IS NULL OR v.organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR v.id = :vehicle_id)
),
open_tire AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM tire_health_alerts
  WHERE status = 'OPEN'
  GROUP BY vehicle_id
),
open_brake AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM brake_health_alerts
  WHERE status = 'OPEN'
  GROUP BY vehicle_id
),
active_dtc AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM vehicle_dtc_events
  WHERE is_active = TRUE
  GROUP BY vehicle_id
),
active_insights AS (
  SELECT
    (entity_ids->>0) AS vehicle_id,
    COUNT(*) AS cnt
  FROM dashboard_insights
  WHERE is_active = TRUE
    AND entity_scope = 'VEHICLE'
    AND entity_ids IS NOT NULL
    AND jsonb_typeof(entity_ids) = 'array'
  GROUP BY (entity_ids->>0)
),
open_notifications AS (
  SELECT entity_id AS vehicle_id, COUNT(*) AS cnt
  FROM notifications
  WHERE entity_type = 'VEHICLE'
    AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
    AND domain = 'VEHICLE_HEALTH'
  GROUP BY entity_id
),
open_complaints AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM vehicle_complaints
  WHERE status = 'ACTIVE'
    AND blocks_rental = TRUE
  GROUP BY vehicle_id
),
open_connectivity AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM device_connection_episodes
  WHERE status = 'OPEN'
  GROUP BY vehicle_id
),
blocking_tasks AS (
  SELECT vehicle_id, COUNT(*) AS cnt
  FROM org_tasks
  WHERE status NOT IN ('COMPLETED', 'CANCELLED')
    AND blocks_vehicle_availability = TRUE
    AND vehicle_id IS NOT NULL
  GROUP BY vehicle_id
)
SELECT
  vs.organization_id,
  vs.vehicle_id,
  COALESCE(ot.cnt, 0) AS open_tire_alerts,
  COALESCE(ob.cnt, 0) AS open_brake_alerts,
  COALESCE(ad.cnt, 0) AS active_dtc,
  COALESCE(ai.cnt, 0) AS active_dashboard_insights,
  COALESCE(onot.cnt, 0) AS open_vehicle_health_notifications,
  COALESCE(oc.cnt, 0) AS active_blocking_complaints,
  COALESCE(ocon.cnt, 0) AS open_connectivity_episodes,
  COALESCE(bt.cnt, 0) AS blocking_tasks,
  (
    COALESCE(ot.cnt, 0) + COALESCE(ob.cnt, 0) + COALESCE(ad.cnt, 0)
    + COALESCE(oc.cnt, 0) + COALESCE(ocon.cnt, 0) + COALESCE(bt.cnt, 0)
  ) AS domain_finding_sum,
  COALESCE(onot.cnt, 0) - COALESCE(ai.cnt, 0) AS notification_minus_insight_delta
FROM vehicle_scope vs
LEFT JOIN open_tire ot ON ot.vehicle_id = vs.vehicle_id
LEFT JOIN open_brake ob ON ob.vehicle_id = vs.vehicle_id
LEFT JOIN active_dtc ad ON ad.vehicle_id = vs.vehicle_id
LEFT JOIN active_insights ai ON ai.vehicle_id = vs.vehicle_id
LEFT JOIN open_notifications onot ON onot.vehicle_id = vs.vehicle_id
LEFT JOIN open_complaints oc ON oc.vehicle_id = vs.vehicle_id
LEFT JOIN open_connectivity ocon ON ocon.vehicle_id = vs.vehicle_id
LEFT JOIN blocking_tasks bt ON bt.vehicle_id = vs.vehicle_id
WHERE
  COALESCE(ot.cnt, 0) > 0
  OR COALESCE(ob.cnt, 0) > 0
  OR COALESCE(ad.cnt, 0) > 0
  OR COALESCE(ai.cnt, 0) > 0
  OR COALESCE(onot.cnt, 0) > 0
  OR COALESCE(oc.cnt, 0) > 0
  OR COALESCE(ocon.cnt, 0) > 0
  OR COALESCE(bt.cnt, 0) > 0
ORDER BY domain_finding_sum DESC, notification_minus_insight_delta DESC;

-- Vehicles with notifications but zero domain alerts (projection-only warnings)
WITH vehicle_scope AS (
  SELECT v.id AS vehicle_id, v.organization_id
  FROM vehicles v
  WHERE (:organization_id IS NULL OR v.organization_id = :organization_id)
    AND (:vehicle_id IS NULL OR v.id = :vehicle_id)
),
open_tire AS (
  SELECT vehicle_id, COUNT(*) AS cnt FROM tire_health_alerts WHERE status = 'OPEN' GROUP BY vehicle_id
),
open_brake AS (
  SELECT vehicle_id, COUNT(*) AS cnt FROM brake_health_alerts WHERE status = 'OPEN' GROUP BY vehicle_id
),
active_dtc AS (
  SELECT vehicle_id, COUNT(*) AS cnt FROM vehicle_dtc_events WHERE is_active = TRUE GROUP BY vehicle_id
),
open_notifications AS (
  SELECT entity_id AS vehicle_id, COUNT(*) AS cnt
  FROM notifications
  WHERE entity_type = 'VEHICLE'
    AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
    AND domain = 'VEHICLE_HEALTH'
  GROUP BY entity_id
)
SELECT
  vs.organization_id,
  vs.vehicle_id,
  onot.cnt AS open_vehicle_health_notifications,
  COALESCE(ot.cnt, 0) + COALESCE(ob.cnt, 0) + COALESCE(ad.cnt, 0) AS domain_alert_sum
FROM vehicle_scope vs
INNER JOIN open_notifications onot ON onot.vehicle_id = vs.vehicle_id
LEFT JOIN open_tire ot ON ot.vehicle_id = vs.vehicle_id
LEFT JOIN open_brake ob ON ob.vehicle_id = vs.vehicle_id
LEFT JOIN active_dtc ad ON ad.vehicle_id = vs.vehicle_id
WHERE onot.cnt > 0
  AND COALESCE(ot.cnt, 0) + COALESCE(ob.cnt, 0) + COALESCE(ad.cnt, 0) = 0
ORDER BY onot.cnt DESC;
