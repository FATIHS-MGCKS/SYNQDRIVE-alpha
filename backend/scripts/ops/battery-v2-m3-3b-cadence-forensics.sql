-- M3.3B.2 — Strict ICE LTE_R1 cadence forensics (read-only).
-- Mapping semantics MUST match rest-cadence-qualification.policy.ts deriveNominalRestIntervalIndex().
\set ON_ERROR_STOP on

-- Constants (ms) — keep in sync with rest-cadence-qualification.policy.ts
-- ANCHOR_MAX_AGE_MS=180000 RUNG_0_UPPER=14400000 R1_NOMINAL=28800000

\echo '=== §1 Strict cohort counts ==='
WITH ice AS (
  SELECT id AS vehicle_id FROM vehicles
  WHERE hardware_type = 'LTE_R1' AND fuel_type IN ('GASOLINE', 'DIESEL')
),
lv AS (
  SELECT
    m.provider_timestamp AS pt,
    m.observed_at,
    (m.context->>'engineRunning')::boolean AS er,
    (m.context->>'speedKmh')::float AS spd,
    (m.context->>'ignitionOn')::boolean AS ign,
    COALESCE((m.context->>'isLvCharging')::boolean, false) AS lv_ch,
    COALESCE((m.context->>'isHvCharging')::boolean, false) AS hv_ch
  FROM battery_measurements m
  JOIN ice i ON i.vehicle_id = m.vehicle_id
  WHERE m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND (m.context->>'engineRunning')::boolean IS FALSE
)
SELECT
  count(*) AS total_parked_engine_off_rows,
  count(*) FILTER (WHERE pt IS NOT NULL) AS provider_timestamp_qualified_rows,
  count(*) FILTER (WHERE pt IS NULL) AS rows_excluded_no_provider_timestamp,
  count(*) FILTER (
    WHERE pt IS NOT NULL
      AND er IS FALSE
      AND spd IS NOT NULL AND spd <= 0.5
      AND ign IS FALSE
      AND NOT lv_ch AND NOT hv_ch
  ) AS strict_rest_observations,
  count(*) FILTER (
    WHERE pt IS NOT NULL AND er IS FALSE AND (spd IS NULL OR spd <= 0.5)
  ) AS relaxed_rest_observations,
  count(*) FILTER (
    WHERE pt IS NOT NULL AND er IS FALSE AND spd IS NULL
  ) AS unknown_speed_excluded_from_strict,
  count(*) FILTER (
    WHERE pt IS NOT NULL AND er IS FALSE
      AND spd IS NOT NULL AND spd <= 0.5 AND (lv_ch OR hv_ch)
  ) AS charging_contaminated_excluded
FROM lv;

\echo '=== §2 Session segmentation + strict rest ages ==='
WITH ice AS (
  SELECT id AS vehicle_id, license_plate FROM vehicles
  WHERE hardware_type = 'LTE_R1' AND fuel_type IN ('GASOLINE', 'DIESEL')
),
allp AS (
  SELECT
    m.vehicle_id,
    i.license_plate,
    m.provider_timestamp AS pt,
    (
      m.provider_timestamp IS NOT NULL
      AND (m.context->>'engineRunning')::boolean IS FALSE
      AND (m.context->>'speedKmh')::float IS NOT NULL
      AND (m.context->>'speedKmh')::float <= 0.5
      AND (m.context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
    ) AS strict_rest
  FROM battery_measurements m
  JOIN ice i ON i.vehicle_id = m.vehicle_id
  WHERE m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND m.provider_timestamp IS NOT NULL
),
seg AS (
  SELECT
    *,
    sum(CASE WHEN NOT strict_rest THEN 1 ELSE 0 END)
      OVER (PARTITION BY vehicle_id ORDER BY pt ROWS UNBOUNDED PRECEDING) AS rest_seg
  FROM allp
),
strict_only AS (
  SELECT * FROM seg WHERE strict_rest
),
sessions AS (
  SELECT
    vehicle_id,
    license_plate,
    rest_seg,
    min(pt) AS anchor_at,
    count(*) AS obs_count,
    (extract(epoch FROM (max(pt) - min(pt))) * 1000)::bigint AS duration_ms
  FROM strict_only
  GROUP BY vehicle_id, license_plate, rest_seg
)
SELECT
  count(*) AS strict_rest_sessions,
  sum(obs_count)::int AS strict_rest_observations_in_sessions
FROM sessions;

\echo '=== §3 Inter-arrival bins (within session, strict) ==='
WITH forensics_base AS (
  SELECT
    m.vehicle_id,
    m.provider_timestamp AS pt,
    (
      m.provider_timestamp IS NOT NULL
      AND (m.context->>'engineRunning')::boolean IS FALSE
      AND (m.context->>'speedKmh')::float IS NOT NULL
      AND (m.context->>'speedKmh')::float <= 0.5
      AND (m.context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
    ) AS strict_rest
  FROM battery_measurements m
  JOIN vehicles v ON v.id = m.vehicle_id
  WHERE v.hardware_type = 'LTE_R1'
    AND v.fuel_type IN ('GASOLINE', 'DIESEL')
    AND m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND m.provider_timestamp IS NOT NULL
),
seg AS (
  SELECT
    *,
    sum(CASE WHEN NOT strict_rest THEN 1 ELSE 0 END)
      OVER (PARTITION BY vehicle_id ORDER BY pt ROWS UNBOUNDED PRECEDING) AS rest_seg
  FROM forensics_base
),
strict_only AS (
  SELECT * FROM seg WHERE strict_rest
),
deltas AS (
  SELECT
    (extract(epoch FROM (
      pt - lag(pt) OVER (PARTITION BY vehicle_id, rest_seg ORDER BY pt)
    )) * 1000)::bigint AS delta_ms
  FROM strict_only
),
pos AS (
  SELECT delta_ms FROM deltas WHERE delta_ms IS NOT NULL AND delta_ms > 0
)
SELECT
  count(*) AS interarrival_count,
  count(*) FILTER (WHERE delta_ms < 3600000) AS b_0_1h,
  count(*) FILTER (WHERE delta_ms >= 3600000 AND delta_ms < 4 * 3600000) AS b_1_4h,
  count(*) FILTER (WHERE delta_ms >= 4 * 3600000 AND delta_ms < 6 * 3600000) AS b_4_6h,
  count(*) FILTER (WHERE delta_ms >= 6 * 3600000 AND delta_ms < 10 * 3600000) AS b_6_10h,
  count(*) FILTER (WHERE delta_ms >= 10 * 3600000 AND delta_ms < 14 * 3600000) AS b_10_14h,
  count(*) FILTER (WHERE delta_ms >= 14 * 3600000 AND delta_ms < 18 * 3600000) AS b_14_18h,
  count(*) FILTER (WHERE delta_ms >= 18 * 3600000 AND delta_ms < 22 * 3600000) AS b_18_22h,
  count(*) FILTER (WHERE delta_ms >= 22 * 3600000 AND delta_ms < 26 * 3600000) AS b_22_26h,
  count(*) FILTER (WHERE delta_ms >= 26 * 3600000) AS b_gt_26h
FROM pos;

\echo '=== §4 Rest-age bins (from session anchor, strict) ==='
WITH forensics_base AS (
  SELECT
    m.vehicle_id,
    m.provider_timestamp AS pt,
    (
      m.provider_timestamp IS NOT NULL
      AND (m.context->>'engineRunning')::boolean IS FALSE
      AND (m.context->>'speedKmh')::float IS NOT NULL
      AND (m.context->>'speedKmh')::float <= 0.5
      AND (m.context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
    ) AS strict_rest
  FROM battery_measurements m
  JOIN vehicles v ON v.id = m.vehicle_id
  WHERE v.hardware_type = 'LTE_R1'
    AND v.fuel_type IN ('GASOLINE', 'DIESEL')
    AND m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND m.provider_timestamp IS NOT NULL
),
seg AS (
  SELECT
    *,
    sum(CASE WHEN NOT strict_rest THEN 1 ELSE 0 END)
      OVER (PARTITION BY vehicle_id ORDER BY pt ROWS UNBOUNDED PRECEDING) AS rest_seg
  FROM forensics_base
),
strict_only AS (
  SELECT * FROM seg WHERE strict_rest
),
ages AS (
  SELECT
    (extract(epoch FROM (
      pt - min(pt) OVER (PARTITION BY vehicle_id, rest_seg)
    )) * 1000)::bigint AS rest_age_ms
  FROM strict_only
)
SELECT
  count(*) AS all_rest_age_rows,
  count(*) FILTER (WHERE rest_age_ms < 3600000) AS b_0_1h,
  count(*) FILTER (WHERE rest_age_ms >= 3600000 AND rest_age_ms < 4 * 3600000) AS b_1_4h,
  count(*) FILTER (WHERE rest_age_ms >= 4 * 3600000 AND rest_age_ms < 6 * 3600000) AS b_4_6h,
  count(*) FILTER (WHERE rest_age_ms >= 6 * 3600000 AND rest_age_ms < 10 * 3600000) AS b_6_10h,
  count(*) FILTER (WHERE rest_age_ms >= 10 * 3600000 AND rest_age_ms < 14 * 3600000) AS b_10_14h,
  count(*) FILTER (WHERE rest_age_ms >= 14 * 3600000 AND rest_age_ms < 18 * 3600000) AS b_14_18h,
  count(*) FILTER (WHERE rest_age_ms >= 18 * 3600000 AND rest_age_ms < 22 * 3600000) AS b_18_22h,
  count(*) FILTER (WHERE rest_age_ms >= 22 * 3600000 AND rest_age_ms < 26 * 3600000) AS b_22_26h,
  count(*) FILTER (WHERE rest_age_ms >= 26 * 3600000) AS b_gt_26h
FROM ages;

\echo '=== §5 Runtime-aligned nominal index + ladder residuals ==='
WITH forensics_base AS (
  SELECT
    m.vehicle_id,
    v.license_plate,
    m.provider_timestamp AS pt,
    (
      m.provider_timestamp IS NOT NULL
      AND (m.context->>'engineRunning')::boolean IS FALSE
      AND (m.context->>'speedKmh')::float IS NOT NULL
      AND (m.context->>'speedKmh')::float <= 0.5
      AND (m.context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
    ) AS strict_rest
  FROM battery_measurements m
  JOIN vehicles v ON v.id = m.vehicle_id
  WHERE v.hardware_type = 'LTE_R1'
    AND v.fuel_type IN ('GASOLINE', 'DIESEL')
    AND m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND m.provider_timestamp IS NOT NULL
),
seg AS (
  SELECT
    *,
    sum(CASE WHEN NOT strict_rest THEN 1 ELSE 0 END)
      OVER (PARTITION BY vehicle_id ORDER BY pt ROWS UNBOUNDED PRECEDING) AS rest_seg
  FROM forensics_base
),
strict_only AS (
  SELECT * FROM seg WHERE strict_rest
),
ages AS (
  SELECT
    vehicle_id,
    license_plate,
    (extract(epoch FROM (
      pt - min(pt) OVER (PARTITION BY vehicle_id, rest_seg)
    )) * 1000)::bigint AS rest_age_ms
  FROM strict_only
),
mapped AS (
  SELECT
    a.*,
    CASE
      WHEN rest_age_ms <= 180000 THEN 0
      WHEN rest_age_ms < 14400000 THEN 0
      ELSE coalesce((
        SELECT k
        FROM generate_series(1, 21) AS k
        WHERE rest_age_ms >= ((k - 0.5) * 28800000)::bigint
          AND rest_age_ms < ((k + 0.5) * 28800000)::bigint
        LIMIT 1
      ), -1)
    END AS nominal_index
  FROM ages a
),
with_residual AS (
  SELECT
    *,
    rest_age_ms - nominal_index * 28800000 AS rung_residual_ms
  FROM mapped
  WHERE nominal_index >= 1
)
SELECT
  (SELECT count(*) FROM mapped) AS all_rest_observations,
  (SELECT count(*) FROM mapped WHERE nominal_index = 0) AS sub_4h_index0_observations,
  (SELECT count(*) FROM mapped WHERE nominal_index >= 1) AS ladder_candidate_observations,
  count(*) AS ladder_residual_sample_count,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY rung_residual_ms)::bigint AS residual_p25_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY rung_residual_ms)::bigint AS residual_p50_ms,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY rung_residual_ms)::bigint AS residual_p75_ms,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY abs(rung_residual_ms))::bigint AS residual_p90_abs_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY abs(rung_residual_ms))::bigint AS residual_p95_abs_ms,
  max(abs(rung_residual_ms))::bigint AS residual_max_abs_ms
FROM with_residual;

\echo '=== §6 Per-vehicle ladder-candidate residuals ==='
WITH forensics_base AS (
  SELECT
    m.vehicle_id,
    v.license_plate,
    m.provider_timestamp AS pt,
    (
      m.provider_timestamp IS NOT NULL
      AND (m.context->>'engineRunning')::boolean IS FALSE
      AND (m.context->>'speedKmh')::float IS NOT NULL
      AND (m.context->>'speedKmh')::float <= 0.5
      AND (m.context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
    ) AS strict_rest
  FROM battery_measurements m
  JOIN vehicles v ON v.id = m.vehicle_id
  WHERE v.hardware_type = 'LTE_R1'
    AND v.fuel_type IN ('GASOLINE', 'DIESEL')
    AND m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND m.provider_timestamp IS NOT NULL
),
seg AS (
  SELECT
    *,
    sum(CASE WHEN NOT strict_rest THEN 1 ELSE 0 END)
      OVER (PARTITION BY vehicle_id ORDER BY pt ROWS UNBOUNDED PRECEDING) AS rest_seg
  FROM forensics_base
),
strict_only AS (
  SELECT * FROM seg WHERE strict_rest
),
ages AS (
  SELECT
    license_plate,
    (extract(epoch FROM (
      pt - min(pt) OVER (PARTITION BY vehicle_id, rest_seg)
    )) * 1000)::bigint AS rest_age_ms
  FROM strict_only
),
mapped AS (
  SELECT
    a.*,
    CASE
      WHEN rest_age_ms <= 180000 THEN 0
      WHEN rest_age_ms < 14400000 THEN 0
      ELSE coalesce((
        SELECT k
        FROM generate_series(1, 21) AS k
        WHERE rest_age_ms >= ((k - 0.5) * 28800000)::bigint
          AND rest_age_ms < ((k + 0.5) * 28800000)::bigint
        LIMIT 1
      ), -1)
    END AS nominal_index
  FROM ages a
),
with_residual AS (
  SELECT
    license_plate,
    rest_age_ms - nominal_index * 28800000 AS rung_residual_ms
  FROM mapped
  WHERE nominal_index >= 1
)
SELECT
  license_plate,
  count(*) AS ladder_candidate_count,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY rung_residual_ms)::bigint AS residual_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY abs(rung_residual_ms))::bigint AS residual_p95_abs_ms
FROM with_residual
GROUP BY license_plate
ORDER BY license_plate;
