-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Find warning/alert/notification rows referencing missing or deleted vehicles.
-- Scope: Read-only SELECT.
-- Expected: Zero rows (FK should prevent most cases; inbox/nullable vehicle_id may differ).
-- organizationId scope: Optional :organization_id filter.
-- UTC window: N/A.

-- Alerts / findings with vehicle_id not in vehicles (should not happen with FK)
SELECT 'tire_health_alerts' AS source, a.id, a.organization_id, a.vehicle_id
FROM tire_health_alerts a
LEFT JOIN vehicles v ON v.id = a.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'brake_health_alerts', a.id, a.organization_id, a.vehicle_id
FROM brake_health_alerts a
LEFT JOIN vehicles v ON v.id = a.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'vehicle_dtc_events', e.id, NULL, e.vehicle_id
FROM vehicle_dtc_events e
LEFT JOIN vehicles v ON v.id = e.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'vehicle_complaints', c.id, c.organization_id, c.vehicle_id
FROM vehicle_complaints c
LEFT JOIN vehicles v ON v.id = c.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'notifications_vehicle', n.id, n.organization_id, n.entity_id
FROM notifications n
LEFT JOIN vehicles v ON v.id = n.entity_id
WHERE n.entity_type = 'VEHICLE'
  AND v.id IS NULL
  AND (:organization_id IS NULL OR n.organization_id = :organization_id);

-- Vehicle-scoped projections without parent vehicle
SELECT 'vehicle_latest_states' AS source, s.id, NULL, s.vehicle_id
FROM vehicle_latest_states s
LEFT JOIN vehicles v ON v.id = s.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'brake_health_current', bhc.vehicle_id, bhc.organization_id, bhc.vehicle_id
FROM brake_health_current bhc
LEFT JOIN vehicles v ON v.id = bhc.vehicle_id
WHERE v.id IS NULL

UNION ALL

SELECT 'battery_features', bf.id, NULL, bf.vehicle_id
FROM battery_features bf
LEFT JOIN vehicles v ON v.id = bf.vehicle_id
WHERE v.id IS NULL;

-- Webhook inbox: mapped vehicle_id but vehicle missing (mapping drift)
SELECT
  'device_connection_webhook_inbox' AS source,
  i.id,
  i.organization_id,
  i.vehicle_id,
  i.processing_status,
  i.vehicle_mapping_status
FROM device_connection_webhook_inbox i
LEFT JOIN vehicles v ON v.id = i.vehicle_id
WHERE i.vehicle_id IS NOT NULL
  AND v.id IS NULL
  AND (:organization_id IS NULL OR i.organization_id = :organization_id);

-- OrgTask / ServiceCase vehicle link orphan
SELECT 'org_tasks' AS source, t.id, t.organization_id, t.vehicle_id
FROM org_tasks t
LEFT JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.vehicle_id IS NOT NULL
  AND v.id IS NULL
  AND (:organization_id IS NULL OR t.organization_id = :organization_id)

UNION ALL

SELECT 'service_cases', sc.id, sc.organization_id, sc.vehicle_id
FROM service_cases sc
LEFT JOIN vehicles v ON v.id = sc.vehicle_id
WHERE sc.vehicle_id IS NOT NULL
  AND v.id IS NULL
  AND (:organization_id IS NULL OR sc.organization_id = :organization_id);
