-- EXP021 PR #2001 — read-only discovery mirror (psql variables from audit shell).
-- Predicates align with di-v0-s4b-discovery.service.ts selectCandidates().

\set ON_ERROR_STOP on

SELECT 'GLOBAL_KILL' AS probe, kill_state::text FROM di_v0_s4_control WHERE id = 'GLOBAL';

SELECT 'ACTIVE_PIPELINE_VERSION' AS probe, pipeline_version_key, status
FROM di_v0_s4_pipeline_versions
WHERE status = 'ACTIVE'
ORDER BY registered_at DESC
LIMIT 3;

SELECT 'VEHICLE_ALLOWLIST_VALIDATION' AS probe,
       v.id AS vehicle_id,
       v.organization_id,
       (v.organization_id::text = ANY(string_to_array(:'org_csv', '|')::text[])) AS org_matches
FROM vehicles v
WHERE v.id::text = ANY(string_to_array(:'vehicle_csv', '|')::text[])
ORDER BY v.id;

SELECT 'VEHICLE_ALLOWLIST_MISSING' AS probe, count(*)::int AS missing_count
FROM unnest(string_to_array(:'vehicle_csv', '|')::text[]) AS expected(id)
WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id::text = expected.id);

WITH params AS (
  SELECT
    :'not_before'::timestamptz AS not_before,
    string_to_array(:'org_csv', '|')::text[] AS orgs,
    string_to_array(:'vehicle_csv', '|')::text[] AS vehicles,
    (SELECT pipeline_version_key FROM di_v0_s4_pipeline_versions WHERE status = 'ACTIVE' ORDER BY registered_at DESC LIMIT 1) AS active_pvk,
    :quiet_legacy::int AS quiet_legacy,
    :quiet_policy::int AS quiet_policy,
    :batch_limit::int AS batch_limit
),
scoped_trips AS (
  SELECT
    t.id AS trip_id,
    v.organization_id,
    t.vehicle_id,
    t.end_time,
    GREATEST(
      t.end_time AT TIME ZONE 'UTC',
      t.created_at AT TIME ZONE 'UTC',
      (SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED') AT TIME ZONE 'UTC'
    ) AS anchor
  FROM vehicle_trips t
  JOIN vehicles v ON v.id = t.vehicle_id
  CROSS JOIN params p
  WHERE t.trip_status::text = 'COMPLETED'
    AND t.end_time IS NOT NULL
    AND v.organization_id::text = ANY(p.orgs)
    AND t.vehicle_id::text = ANY(p.vehicles)
),
enriched AS (
  SELECT
    s.*,
    p.not_before,
    p.active_pvk,
    p.quiet_legacy,
    p.quiet_policy,
    p.batch_limit,
    (s.end_time >= p.not_before) AS after_not_before,
    EXISTS (
      SELECT 1 FROM di_v0_s4_work_items w
      WHERE w.organization_id = s.organization_id
        AND w.trip_id = s.trip_id
        AND w.pipeline_version_key = p.active_pvk
        AND w.run_purpose = 'PRIMARY'
        AND w.status <> 'SUPERSEDED'
    ) AS has_active_primary,
    (s.anchor + make_interval(secs => p.quiet_legacy) <= clock_timestamp()) AS eligible_legacy_quiet,
    (s.anchor + make_interval(secs => p.quiet_policy) <= clock_timestamp()) AS eligible_policy_quiet
  FROM scoped_trips s
  CROSS JOIN params p
)
SELECT metric, value FROM (
  SELECT 'HISTORICAL_COMPLETED_WAVE_FLEET' AS metric, count(*)::text AS value FROM enriched
  UNION ALL SELECT 'BEFORE_NOT_BEFORE', count(*)::text FROM enriched WHERE NOT after_not_before
  UNION ALL SELECT 'AFTER_NOT_BEFORE_IN_ALLOWLIST', count(*)::text FROM enriched WHERE after_not_before
  UNION ALL SELECT 'HAS_ACTIVE_PRIMARY_AFTER_NOT_BEFORE', count(*)::text FROM enriched WHERE after_not_before AND has_active_primary
  UNION ALL SELECT 'NO_PRIMARY_AFTER_NOT_BEFORE', count(*)::text FROM enriched WHERE after_not_before AND NOT has_active_primary
  UNION ALL SELECT 'DISCOVERY_ELIGIBLE_LEGACY_QUIET', count(*)::text FROM enriched
    WHERE after_not_before AND NOT has_active_primary AND eligible_legacy_quiet
  UNION ALL SELECT 'DISCOVERY_ELIGIBLE_POLICY_QUIET', count(*)::text FROM enriched
    WHERE after_not_before AND NOT has_active_primary AND eligible_policy_quiet
  UNION ALL SELECT 'HELD_LEGACY_ONLY_NOT_POLICY', count(*)::text FROM enriched
    WHERE after_not_before AND NOT has_active_primary AND NOT eligible_legacy_quiet AND eligible_policy_quiet
  UNION ALL SELECT 'NEWLY_ELIGIBLE_POLICY_VS_LEGACY', count(*)::text FROM enriched
    WHERE after_not_before AND NOT has_active_primary AND eligible_policy_quiet AND NOT eligible_legacy_quiet
  UNION ALL SELECT 'MAX_WI_30MIN_AT_BATCH_EVERY_5MIN', (6 * (SELECT batch_limit FROM params LIMIT 1))::text
  UNION ALL SELECT 'MAX_WI_60MIN_AT_BATCH_EVERY_5MIN', (12 * (SELECT batch_limit FROM params LIMIT 1))::text
) m
ORDER BY metric;

WITH params AS (
  SELECT
    :'not_before'::timestamptz AS not_before,
    string_to_array(:'org_csv', '|')::text[] AS orgs,
    string_to_array(:'vehicle_csv', '|')::text[] AS vehicles,
    (SELECT pipeline_version_key FROM di_v0_s4_pipeline_versions WHERE status = 'ACTIVE' ORDER BY registered_at DESC LIMIT 1) AS active_pvk,
    :quiet_policy::int AS quiet_policy,
    :batch_limit::int AS batch_limit
)
SELECT 'FIRST_DISCOVERY_BATCH' AS probe, t.id AS trip_id, v.organization_id, t.vehicle_id, a.anchor
FROM vehicle_trips t
JOIN vehicles v ON v.id = t.vehicle_id
CROSS JOIN params p
CROSS JOIN LATERAL (
  SELECT GREATEST(
    t.end_time AT TIME ZONE 'UTC',
    t.created_at AT TIME ZONE 'UTC',
    (SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED') AT TIME ZONE 'UTC'
  ) AS anchor
) a
WHERE t.trip_status::text = 'COMPLETED'
  AND t.end_time IS NOT NULL
  AND t.end_time >= p.not_before
  AND v.organization_id::text = ANY(p.orgs)
  AND t.vehicle_id::text = ANY(p.vehicles)
  AND a.anchor + make_interval(secs => p.quiet_policy) <= clock_timestamp()
  AND NOT EXISTS (
    SELECT 1 FROM di_v0_s4_work_items w
    WHERE w.organization_id = v.organization_id
      AND w.trip_id = t.id
      AND w.pipeline_version_key = p.active_pvk
      AND w.run_purpose = 'PRIMARY'
      AND w.status <> 'SUPERSEDED'
  )
ORDER BY a.anchor ASC, t.id ASC
LIMIT (SELECT batch_limit FROM params);

SELECT 'PENDING_LEGACY_24H' AS segment, count(*)::int
FROM di_v0_s4_work_items w
WHERE w.status IN ('PENDING', 'FAILED_RETRYABLE')
  AND abs(extract(epoch FROM (w.eligible_at - w.settlement_anchor_at)) - 86400) < 3;

SELECT 'PENDING_NEAR_600' AS segment, count(*)::int
FROM di_v0_s4_work_items w
WHERE w.status IN ('PENDING', 'FAILED_RETRYABLE')
  AND abs(extract(epoch FROM (w.eligible_at - w.settlement_anchor_at)) - 600) < 3;
