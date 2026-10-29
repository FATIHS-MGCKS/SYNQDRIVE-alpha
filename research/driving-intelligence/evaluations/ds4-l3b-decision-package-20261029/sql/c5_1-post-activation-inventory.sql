\pset format unaligned
\pset fieldsep '|'
\pset tuples_only on

WITH cohort AS (
  SELECT * FROM (VALUES
    ('68868291-5478-42cd-b0c4-cc77b2a78e21'::uuid, 'TESLA_M3'),
    ('19fedd4b-c4e8-4de8-a125-dab293326e7e'::uuid, 'TIGUAN'),
    ('c10351f8-b6a2-4258-947f-631aeaa6d359'::uuid, 'AUDI_A4'),
    ('8c850ff1-4201-432b-af2e-2711dbc7ca48'::uuid, 'ARTEON')
  ) AS t(vehicle_id, label)
),
activation AS (
  SELECT timestamptz '2026-10-23T21:47:00Z' AS c51_since
),
completed_trips AS (
  SELECT DISTINCT ON (vt.id)
    vt.id::text AS trip_id,
    c.label,
    vt.vehicle_id::text AS vehicle_id,
    vt.end_time,
    wi.completed_at AS work_item_completed_at,
    wi.pinned_snapshot_hash,
    CASE
      WHEN c.label IN ('TESLA_M3', 'TIGUAN') THEN 'C5_1_ELIGIBLE'
      ELSE 'C4_SHADOW_ONLY'
    END AS vehicle_admission,
    CASE
      WHEN c.label IN ('TESLA_M3', 'TIGUAN')
        AND wi.completed_at >= (SELECT c51_since FROM activation)
      THEN true
      ELSE false
    END AS c51_effective_by_work_item
  FROM vehicle_trips vt
  JOIN cohort c ON c.vehicle_id::text = vt.vehicle_id::text
  JOIN di_v0_s4_work_items wi ON wi.trip_id = vt.id::text
    AND wi.status = 'COMPLETED'
    AND wi.pinned_snapshot_hash IS NOT NULL
  WHERE vt.trip_status = 'COMPLETED'
    AND vt.end_time >= timestamptz '2026-09-01T00:00:00Z'
  ORDER BY vt.id, wi.completed_at DESC NULLS LAST
)
SELECT 'POST_ACTIVATION_TRIPS_ALL_VEHICLES|' || COUNT(*)::text
FROM completed_trips, activation a
WHERE work_item_completed_at >= a.c51_since
UNION ALL
SELECT 'POST_ACTIVATION_BY_LABEL|' || label || '|' || COUNT(*)::text
FROM completed_trips, activation a
WHERE work_item_completed_at >= a.c51_since
GROUP BY label
UNION ALL
SELECT 'C51_EFFECTIVE_TRIPS|' || COUNT(*)::text FROM completed_trips WHERE c51_effective_by_work_item
UNION ALL
SELECT 'C51_EFFECTIVE_BY_LABEL|' || label || '|' || COUNT(*)::text FROM completed_trips WHERE c51_effective_by_work_item GROUP BY label
UNION ALL
SELECT 'C51_EFFECTIVE_WITH_MOTION|' || COUNT(*)::text
FROM completed_trips ct
WHERE ct.c51_effective_by_work_item
  AND EXISTS (
    SELECT 1 FROM di_v0_motion_core_shadow_runs_v1 mr
    WHERE mr.trip_id = ct.trip_id AND mr.shadow_status = 'SUCCEEDED'
  )
UNION ALL
SELECT 'C51_EFFECTIVE_WITH_DS4_ASSESSMENT|' || COUNT(*)::text
FROM completed_trips ct
WHERE ct.c51_effective_by_work_item
  AND EXISTS (
    SELECT 1 FROM ds4_trip_assessments_v1 da
    WHERE da.trip_id = ct.trip_id
  );
