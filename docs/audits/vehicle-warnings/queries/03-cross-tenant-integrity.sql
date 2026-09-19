-- Vehicle Warnings Audit — Prompt 5
-- Purpose: Detect organization_id mismatches between child warning rows and parent vehicles.
-- Scope: Read-only SELECT. PA-02 cross-tenant integrity checks.
-- Expected: Zero rows.
-- organizationId scope: All orgs (full scan) or filter :organization_id.
-- UTC window: N/A.

-- ── Tables with NOT NULL organization_id on child row ──
SELECT
  'tire_health_alerts' AS table_name,
  a.id AS row_id,
  a.organization_id AS child_org_id,
  v.organization_id AS vehicle_org_id,
  a.vehicle_id
FROM tire_health_alerts a
INNER JOIN vehicles v ON v.id = a.vehicle_id
WHERE a.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR a.organization_id = :organization_id)

UNION ALL

SELECT
  'brake_health_alerts',
  a.id,
  a.organization_id,
  v.organization_id,
  a.vehicle_id
FROM brake_health_alerts a
INNER JOIN vehicles v ON v.id = a.vehicle_id
WHERE a.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR a.organization_id = :organization_id)

UNION ALL

SELECT
  'vehicle_complaints',
  c.id,
  c.organization_id,
  v.organization_id,
  c.vehicle_id
FROM vehicle_complaints c
INNER JOIN vehicles v ON v.id = c.vehicle_id
WHERE c.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR c.organization_id = :organization_id)

UNION ALL

SELECT
  'notifications',
  n.id,
  n.organization_id,
  v.organization_id,
  n.entity_id
FROM notifications n
INNER JOIN vehicles v ON v.id = n.entity_id
WHERE n.entity_type = 'VEHICLE'
  AND n.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR n.organization_id = :organization_id)

UNION ALL

SELECT
  'device_connection_episodes',
  e.id,
  e.organization_id,
  v.organization_id,
  e.vehicle_id
FROM device_connection_episodes e
INNER JOIN vehicles v ON v.id = e.vehicle_id
WHERE e.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR e.organization_id = :organization_id)

UNION ALL

SELECT
  'misuse_cases',
  m.id,
  m.organization_id,
  v.organization_id,
  m.vehicle_id
FROM misuse_cases m
INNER JOIN vehicles v ON v.id = m.vehicle_id
WHERE m.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR m.organization_id = :organization_id);

-- ── Nullable organization_id: child NULL but vehicle has org (PA-01) ──
SELECT
  'vehicle_damages' AS table_name,
  d.id AS row_id,
  d.organization_id AS child_org_id,
  v.organization_id AS vehicle_org_id,
  d.vehicle_id
FROM vehicle_damages d
INNER JOIN vehicles v ON v.id = d.vehicle_id
WHERE d.organization_id IS NULL
  AND (:organization_id IS NULL OR v.organization_id = :organization_id)

UNION ALL

SELECT
  'brake_evidence',
  be.id,
  be.organization_id,
  v.organization_id,
  be.vehicle_id
FROM brake_evidence be
INNER JOIN vehicles v ON v.id = be.vehicle_id
WHERE be.organization_id IS NULL
  AND (:organization_id IS NULL OR v.organization_id = :organization_id)

UNION ALL

SELECT
  'brake_health_current',
  bhc.vehicle_id,
  bhc.organization_id,
  v.organization_id,
  bhc.vehicle_id
FROM brake_health_current bhc
INNER JOIN vehicles v ON v.id = bhc.vehicle_id
WHERE bhc.organization_id IS NULL
  AND (:organization_id IS NULL OR v.organization_id = :organization_id)

UNION ALL

SELECT
  'vehicle_service_events',
  se.id,
  se.organization_id,
  v.organization_id,
  se.vehicle_id
FROM vehicle_service_events se
INNER JOIN vehicles v ON v.id = se.vehicle_id
WHERE se.organization_id IS NULL
  AND (:organization_id IS NULL OR v.organization_id = :organization_id);

-- ── Nullable org mismatch: child has org but differs from vehicle ──
SELECT
  'vehicle_damages' AS table_name,
  d.id,
  d.organization_id,
  v.organization_id,
  d.vehicle_id
FROM vehicle_damages d
INNER JOIN vehicles v ON v.id = d.vehicle_id
WHERE d.organization_id IS NOT NULL
  AND d.organization_id <> v.organization_id
  AND (:organization_id IS NULL OR d.organization_id = :organization_id);
