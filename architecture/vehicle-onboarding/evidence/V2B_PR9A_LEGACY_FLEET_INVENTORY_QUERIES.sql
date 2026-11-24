-- V2B-PR9A — Read-only legacy fleet inventory (PostgreSQL)
-- Execute ONLY in owner-authorized read-only session. NO writes.
-- Schema maps from backend/prisma/schema.prisma @ main 00b059da7

-- Cohort A: DIMO-linked operational vehicles (canonical path proxy)
-- Classification: SAFE | REQUIRES_ENRICHMENT
SELECT v.id,
       v.organization_id,
       v.vin,
       v.year,
       v.model,
       v.registry_lifecycle,
       v.dimo_vehicle_id
FROM vehicles v
WHERE v.dimo_vehicle_id IS NOT NULL
  AND v.registry_lifecycle = 'ACTIVE';

-- Cohort B: HM canonical — completed onboarding case (HIGH_MOBILITY source_mode)
-- Classification: SAFE
SELECT v.id,
       voc.id AS case_id,
       voc.completed_at,
       voc.source_mode
FROM vehicle_onboarding_cases voc
JOIN vehicles v ON v.id = voc.vehicle_id
WHERE voc.status = 'COMPLETED'
  AND voc.source_mode = 'HIGH_MOBILITY';

-- Cohort C: HM legacy inline — HM mirror REGISTERED with vehicle, no completed HM case
-- Classification: REQUIRES_RECONCILIATION | SAFE (OWN-4: no retroactive billing)
SELECT hmv.id AS hm_id,
       hmv.synqdrive_vehicle_id,
       hmv.vin,
       hmv.registration_state,
       hmv.organization_id
FROM high_mobility_vehicles hmv
LEFT JOIN vehicle_onboarding_cases voc
  ON voc.vehicle_id = hmv.synqdrive_vehicle_id
  AND voc.status = 'COMPLETED'
  AND voc.source_mode = 'HIGH_MOBILITY'
WHERE hmv.registration_state = 'REGISTERED'
  AND hmv.synqdrive_vehicle_id IS NOT NULL
  AND hmv.is_active = true
  AND voc.id IS NULL;

-- Cohort D: Missing model / year on active fleet
-- Classification: REQUIRES_ENRICHMENT
SELECT id, organization_id, vin, year, model, registry_lifecycle
FROM vehicles
WHERE registry_lifecycle = 'ACTIVE'
  AND (year IS NULL OR year = 0 OR model IS NULL OR btrim(model) = '');

-- Cohort E: Active vehicles without active HIGH_MOBILITY or DIMO source link
-- Classification: REQUIRES_RECONCILIATION
SELECT v.id, v.organization_id, v.vin
FROM vehicles v
WHERE v.registry_lifecycle = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM vehicle_data_source_links l
    WHERE l.vehicle_id = v.id
      AND l.is_active = true
      AND l.source_type IN ('HIGH_MOBILITY', 'DIMO')
  );

-- Cohort F: Missing connectionIdentity on active HM link metadata
-- Classification: REQUIRES_ENRICHMENT
SELECT l.id AS link_id,
       l.vehicle_id,
       l.provider,
       l.metadata
FROM vehicle_data_source_links l
WHERE l.is_active = true
  AND l.source_type = 'HIGH_MOBILITY'
  AND (l.metadata IS NULL OR NOT (l.metadata ? 'connectionIdentity'));

-- Cohort G: HM registration state inconsistent with vehicle link
-- Classification: REQUIRES_RECONCILIATION
SELECT hmv.id,
       hmv.vin,
       hmv.registration_state,
       hmv.synqdrive_vehicle_id
FROM high_mobility_vehicles hmv
WHERE hmv.is_active = true
  AND (
    (hmv.registration_state = 'REGISTERED' AND hmv.synqdrive_vehicle_id IS NULL)
    OR (hmv.registration_state <> 'REGISTERED' AND hmv.synqdrive_vehicle_id IS NOT NULL)
  );

-- Cohort H: Duplicate VIN within same org (active)
-- Classification: BLOCKS_CUTOVER
SELECT organization_id, vin, count(*) AS n
FROM vehicles
WHERE registry_lifecycle = 'ACTIVE'
  AND vin IS NOT NULL
GROUP BY organization_id, vin
HAVING count(*) > 1;

-- Cohort I: Active vehicles without VEHICLE_ACTIVATED outbox (HM legacy billing gap candidates)
-- Classification: REQUIRES_RECONCILIATION — NOT billing backfill authority
SELECT v.id,
       v.organization_id,
       v.vin
FROM vehicles v
WHERE v.registry_lifecycle = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM vehicle_data_source_links l
    WHERE l.vehicle_id = v.id AND l.is_active AND l.source_type = 'HIGH_MOBILITY'
  )
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_registry_lifecycle_outbox o
    WHERE o.vehicle_id = v.id
      AND o.event_type = 'VEHICLE_ACTIVATED'
  );

-- Cohort J: OFFBOARDED / ARCHIVED
-- Classification: SAFE (blocked from naive re-register)
SELECT id, organization_id, vin, registry_lifecycle
FROM vehicles
WHERE registry_lifecycle IN ('OFFBOARDED', 'ARCHIVED');