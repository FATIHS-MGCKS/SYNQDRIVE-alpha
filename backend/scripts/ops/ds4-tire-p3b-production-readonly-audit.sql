\set ON_ERROR_STOP on
SET default_transaction_read_only = on;

\echo '=== LAST 5 SUITABLE TRIPS PER VEHICLE (DS4 MOTION JOIN) ==='
WITH audit_vehicles AS (
  SELECT * FROM (VALUES
    ('68868291-5478-42cd-b0c4-cc77b2a78e21'::uuid, 'Tesla_M3_SR'),
    ('19fedd4b-c4e8-4de8-a125-dab293326e7e'::uuid, 'VW_Tiguan'),
    ('c10351f8-b6a2-4258-947f-631aeaa6d359'::uuid, 'Audi_A4'),
    ('8c850ff1-4201-432b-af2e-2711dbc7ca48'::uuid, 'VW_Arteon')
  ) AS v(vehicle_id, label)
),
suitable_trips AS (
SELECT
  t.id AS trip_id,
  t.vehicle_id,
  av.label AS vehicle_label,
  t.end_time,
  t.start_time,
  t.distance_km,
  t.trip_status::text AS trip_status,
  t.possible_end_at,
  t.enriched_at,
  row_number() OVER (PARTITION BY t.vehicle_id ORDER BY t.end_time DESC NULLS LAST) AS rn
FROM vehicle_trips t
JOIN audit_vehicles av ON av.vehicle_id = t.vehicle_id::uuid
WHERE t.trip_status::text = 'COMPLETED'
  AND t.end_time IS NOT NULL
  AND COALESCE(t.distance_km, 0) >= 0.5
)
SELECT
  st.vehicle_label,
  st.trip_id,
  st.end_time,
  round(st.distance_km::numeric, 2) AS distance_km,
  pw.status AS s4_primary_status,
  pw.completed_at AS s4_primary_completed_at,
  pw.lease_acquired_at AS s4_primary_started_at,
  pw.skip_reason,
  pw.failure_class,
  mo.status AS motion_outbox_status,
  mo.attempt_count AS motion_outbox_attempts,
  mo.last_error_code AS motion_outbox_last_error,
  mo.created_at AS motion_outbox_created_at,
  mr.id AS motion_run_id,
  mr.shadow_status AS motion_run_status,
  mr.shadow_bundle_version,
  mr.created_at AS motion_run_created_at,
  mr.summary_json->>'bundleVersion' AS motion_summary_bundle,
  mr.summary_json->>'processingMode' AS processing_mode,
  (mr.summary_json->>'labelCount') AS label_count,
  (mr.summary_json->>'eventAcceptedCount') AS event_accepted_count,
  (mr.summary_json->>'eventArtefactSuspectCount') AS event_artefact_suspect_count,
  mr.summary_json->'limitations' AS limitations_json
FROM suitable_trips st
LEFT JOIN LATERAL (
  SELECT w.*
  FROM di_v0_s4_work_items w
  WHERE w.trip_id = st.trip_id
    AND w.run_purpose = 'PRIMARY'
    AND w.status <> 'SUPERSEDED'
  ORDER BY w.created_at DESC
  LIMIT 1
) pw ON true
LEFT JOIN LATERAL (
  SELECT o.*
  FROM di_v0_motion_core_shadow_outbox_v1 o
  WHERE o.trip_id = st.trip_id
  ORDER BY o.created_at DESC
  LIMIT 1
) mo ON true
LEFT JOIN LATERAL (
  SELECT r.*
  FROM di_v0_motion_core_shadow_runs_v1 r
  WHERE r.trip_id = st.trip_id
  ORDER BY r.created_at DESC
  LIMIT 1
) mr ON true
WHERE st.rn <= 5
ORDER BY st.vehicle_label, st.end_time DESC;

\echo '=== TIGUAN LATENCY LAST 10 SUITABLE TRIPS ==='
WITH audit_vehicles AS (
  SELECT * FROM (VALUES
    ('19fedd4b-c4e8-4de8-a125-dab293326e7e'::uuid, 'VW_Tiguan')
  ) AS v(vehicle_id, label)
),
suitable_trips AS (
  SELECT
    t.id AS trip_id,
    t.vehicle_id,
    av.label AS vehicle_label,
    t.end_time,
    t.possible_end_at,
    t.enriched_at,
    row_number() OVER (ORDER BY t.end_time DESC NULLS LAST) AS rn
  FROM vehicle_trips t
  JOIN audit_vehicles av ON av.vehicle_id = t.vehicle_id::uuid
  WHERE t.trip_status::text = 'COMPLETED'
    AND t.end_time IS NOT NULL
    AND COALESCE(t.distance_km, 0) >= 0.5
),
tiguan AS (
  SELECT * FROM suitable_trips WHERE rn <= 10
),
lat AS (
  SELECT
    tg.trip_id,
    tg.end_time AS t0_trip_end,
    COALESCE(tg.possible_end_at, tg.enriched_at) AS t1_fsm_proxy,
    pw.lease_acquired_at AS t2_s4_primary_started,
    pw.completed_at AS t3_s4_primary_completed,
    mo.created_at AS t4_motion_outbox_insert,
    mo.updated_at AS t5_motion_outbox_updated,
    CASE WHEN mr.shadow_status = 'SUCCEEDED' THEN mr.created_at END AS t6_motion_succeeded,
    pw.status AS s4_status,
    mr.shadow_status AS motion_status
  FROM tiguan tg
  LEFT JOIN LATERAL (
    SELECT w.*
    FROM di_v0_s4_work_items w
    WHERE w.trip_id = tg.trip_id AND w.run_purpose = 'PRIMARY' AND w.status <> 'SUPERSEDED'
    ORDER BY w.created_at DESC LIMIT 1
  ) pw ON true
  LEFT JOIN LATERAL (
    SELECT o.* FROM di_v0_motion_core_shadow_outbox_v1 o
    WHERE o.trip_id = tg.trip_id ORDER BY o.created_at DESC LIMIT 1
  ) mo ON true
  LEFT JOIN LATERAL (
    SELECT r.* FROM di_v0_motion_core_shadow_runs_v1 r
    WHERE r.trip_id = tg.trip_id ORDER BY r.created_at DESC LIMIT 1
  ) mr ON true
)
SELECT
  trip_id,
  t0_trip_end,
  t1_fsm_proxy,
  t2_s4_primary_started,
  t3_s4_primary_completed,
  t4_motion_outbox_insert,
  t5_motion_outbox_updated,
  t6_motion_succeeded,
  CASE WHEN t0_trip_end IS NOT NULL AND t6_motion_succeeded IS NOT NULL
    THEN round(extract(epoch FROM (t6_motion_succeeded - t0_trip_end))::numeric, 1) END AS sec_end_to_ds4_succeeded,
  CASE WHEN t0_trip_end IS NOT NULL AND t1_fsm_proxy IS NOT NULL
    THEN round(extract(epoch FROM (t1_fsm_proxy - t0_trip_end))::numeric, 1) END AS sec_fsm_end_detection,
  CASE WHEN t1_fsm_proxy IS NOT NULL AND t2_s4_primary_started IS NOT NULL
    THEN round(extract(epoch FROM (t2_s4_primary_started - t1_fsm_proxy))::numeric, 1) END AS sec_s4_settlement_wait,
  CASE WHEN t2_s4_primary_started IS NOT NULL AND t3_s4_primary_completed IS NOT NULL
    THEN round(extract(epoch FROM (t3_s4_primary_completed - t2_s4_primary_started))::numeric, 1) END AS sec_s4_processing,
  CASE WHEN t3_s4_primary_completed IS NOT NULL AND t4_motion_outbox_insert IS NOT NULL
    THEN round(extract(epoch FROM (t4_motion_outbox_insert - t3_s4_primary_completed))::numeric, 1) END AS sec_motion_outbox_wait,
  CASE WHEN t4_motion_outbox_insert IS NOT NULL AND t6_motion_succeeded IS NOT NULL
    THEN round(extract(epoch FROM (t6_motion_succeeded - t4_motion_outbox_insert))::numeric, 1) END AS sec_motion_total_after_outbox,
  s4_status,
  motion_status
FROM lat
ORDER BY t0_trip_end DESC;

\echo '=== TIGUAN LATENCY PERCENTILES (end -> motion SUCCEEDED, n>=3) ==='
WITH suitable_trips AS (
  SELECT
    t.id AS trip_id,
    t.end_time,
    row_number() OVER (ORDER BY t.end_time DESC NULLS LAST) AS rn
  FROM vehicle_trips t
  WHERE t.vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
    AND t.trip_status::text = 'COMPLETED'
    AND t.end_time IS NOT NULL
    AND COALESCE(t.distance_km, 0) >= 0.5
),
tiguan AS (
  SELECT * FROM suitable_trips WHERE rn <= 10
),
deltas AS (
  SELECT extract(epoch FROM (mr.created_at - tg.end_time)) AS sec_end_to_ds4
  FROM tiguan tg
  JOIN di_v0_motion_core_shadow_runs_v1 mr ON mr.trip_id = tg.trip_id AND mr.shadow_status = 'SUCCEEDED'
)
SELECT
  count(*)::int AS n,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sec_end_to_ds4)::numeric, 1) AS median_sec,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY sec_end_to_ds4)::numeric, 1) AS p95_sec
FROM deltas
WHERE sec_end_to_ds4 IS NOT NULL;

\echo '=== MOTION OUTBOX HEALTH (ALL ALLOWLIST VEHICLES, 7d) ==='
WITH audit_vehicles AS (
  SELECT * FROM (VALUES
    ('68868291-5478-42cd-b0c4-cc77b2a78e21'::uuid),
    ('19fedd4b-c4e8-4de8-a125-dab293326e7e'::uuid),
    ('c10351f8-b6a2-4258-947f-631aeaa6d359'::uuid),
    ('8c850ff1-4201-432b-af2e-2711dbc7ca48'::uuid)
  ) AS v(vehicle_id)
)
SELECT status, count(*)::int
FROM di_v0_motion_core_shadow_outbox_v1 o
JOIN audit_vehicles av ON av.vehicle_id = o.vehicle_id::uuid
WHERE o.created_at > now() - interval '7 days'
GROUP BY status
ORDER BY status;

\echo '=== TIRE P3B TIGUAN MOTION-BACKLOG COHORT ==='
WITH motion_trips AS (
  SELECT DISTINCT r.trip_id, r.id AS motion_run_id, r.shadow_status, r.shadow_bundle_version, r.created_at AS motion_at
  FROM di_v0_motion_core_shadow_runs_v1 r
  WHERE r.vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
    AND r.shadow_status = 'SUCCEEDED'
)
SELECT
  mt.trip_id,
  vt.trip_status::text,
  vt.end_time,
  round(vt.distance_km::numeric, 2) AS distance_km,
  mt.motion_run_id,
  mt.shadow_bundle_version,
  mt.motion_at,
  ttl.id AS ledger_id,
  ttl.processed_at AS ledger_processed_at,
  ti.id AS tire_input_id,
  ti.adapter_version,
  ti.ds4_read_status,
  ti.temporal_coverage,
  ti.event_quality_coverage,
  ti.di_v0_motion_core_shadow_run_id AS input_motion_run_id,
  CASE
    WHEN ti.di_v0_motion_core_shadow_run_id = '00000000-0000-4000-a000-000000000002' THEN 'TERMINAL_RETRY_EXHAUSTED'
    WHEN ti.di_v0_motion_core_shadow_run_id = '00000000-0000-4000-a000-000000000001' THEN 'TERMINAL_DS4_NOT_AVAILABLE'
    WHEN ti.id IS NULL THEN 'NO_TIRE_INPUT'
    ELSE 'HAS_INPUT'
  END AS tire_shadow_bucket
FROM motion_trips mt
JOIN vehicle_trips vt ON vt.id = mt.trip_id
LEFT JOIN tire_trip_usage_ledger ttl ON ttl.trip_id = mt.trip_id
LEFT JOIN LATERAL (
  SELECT * FROM tire_ds4_motion_shadow_input_v1 x
  WHERE x.trip_id = mt.trip_id
  ORDER BY x.created_at DESC
  LIMIT 3
) ti ON true
ORDER BY mt.motion_at DESC
LIMIT 30;

\echo '=== TIRE SHADOW ADAPTER VERSION COUNTS (TIGUAN) ==='
SELECT adapter_version, ds4_read_status, count(*)::int
FROM tire_ds4_motion_shadow_input_v1
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
GROUP BY adapter_version, ds4_read_status
ORDER BY adapter_version, ds4_read_status;

\echo '=== S4 PRIMARY PENDING/FAILED MOTION ALLOWLIST (7d) ==='
WITH audit_vehicles AS (
  SELECT * FROM (VALUES
    ('68868291-5478-42cd-b0c4-cc77b2a78e21'::uuid, 'Tesla_M3_SR'),
    ('19fedd4b-c4e8-4de8-a125-dab293326e7e'::uuid, 'VW_Tiguan'),
    ('c10351f8-b6a2-4258-947f-631aeaa6d359'::uuid, 'Audi_A4'),
    ('8c850ff1-4201-432b-af2e-2711dbc7ca48'::uuid, 'VW_Arteon')
  ) AS v(vehicle_id, label)
)
SELECT av.label, w.status, count(*)::int
FROM di_v0_s4_work_items w
JOIN audit_vehicles av ON av.vehicle_id = w.vehicle_id::uuid
WHERE w.run_purpose = 'PRIMARY'
  AND w.status <> 'SUPERSEDED'
  AND w.created_at > now() - interval '7 days'
  AND w.status NOT IN ('COMPLETED', 'SKIPPED')
GROUP BY av.label, w.status
ORDER BY av.label, w.status;
