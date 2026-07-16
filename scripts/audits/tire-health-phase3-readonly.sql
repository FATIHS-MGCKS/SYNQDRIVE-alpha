-- Tire Health Phase 3 read-only audit queries (UTC window: 60 days)
\set window_start '(now() at time zone ''UTC'') - interval ''60 days'''

-- 1) Fleet aggregates
SELECT 'AGGREGATES' AS section, json_build_object(
  'window_start_utc', (now() at time zone 'UTC') - interval '60 days',
  'window_end_utc', now() at time zone 'UTC',
  'active_setups', (SELECT count(*) FROM vehicle_tire_setups WHERE status='ACTIVE' AND removed_at IS NULL),
  'all_setups', (SELECT count(*) FROM vehicle_tire_setups),
  'vehicles_with_active', (SELECT count(DISTINCT vehicle_id) FROM vehicle_tire_setups WHERE status='ACTIVE' AND removed_at IS NULL),
  'snapshots_60d', (SELECT count(*) FROM tire_health_snapshots WHERE snapshot_date >= now() - interval '60 days'),
  'wear_points_60d', (SELECT count(*) FROM tire_wear_data_points WHERE created_at >= now() - interval '60 days'),
  'recalc_events_60d', (SELECT count(*) FROM tire_events WHERE type='RECALCULATION' AND created_at >= now() - interval '60 days'),
  'measurements_60d', (SELECT count(*) FROM vehicle_tire_tread_measurements WHERE measured_at >= now() - interval '60 days'),
  'vehicles_pressure', (SELECT count(DISTINCT vehicle_id) FROM vehicle_latest_states WHERE tire_pressure_fl IS NOT NULL OR tire_pressure_fr IS NOT NULL OR tire_pressure_rl IS NOT NULL OR tire_pressure_rr IS NOT NULL)
)::text AS payload;

-- 2) Ground truth classification for wear data points (60d)
SELECT 'GROUND_TRUTH_SUMMARY' AS section, json_build_object(
  'total_points', count(*),
  'synthetic_predicted_as_actual', count(*) FILTER (WHERE abs(actual_tread_mm - predicted_tread_mm) < 0.001),
  'true_ground_truth_likely', count(*) FILTER (WHERE abs(actual_tread_mm - predicted_tread_mm) >= 0.001),
  'zero_residual', count(*) FILTER (WHERE abs(actual_tread_mm - predicted_tread_mm) < 0.001),
  'vehicles', count(DISTINCT vehicle_id),
  'sets', count(DISTINCT tire_set_id)
)::text AS payload
FROM tire_wear_data_points
WHERE created_at >= now() - interval '60 days';

-- 3) Synthetic points by setup (has manual measurement vs not)
SELECT 'SYNTHETIC_BY_MEASUREMENT' AS section, json_build_object(
  'setups_with_measurement', count(DISTINCT w.tire_set_id) FILTER (WHERE m.cnt > 0),
  'setups_without_measurement', count(DISTINCT w.tire_set_id) FILTER (WHERE coalesce(m.cnt,0) = 0),
  'synthetic_points_no_measurement', count(*) FILTER (WHERE coalesce(m.cnt,0) = 0 AND abs(w.actual_tread_mm - w.predicted_tread_mm) < 0.001),
  'gt_points_with_measurement', count(*) FILTER (WHERE coalesce(m.cnt,0) > 0 AND abs(w.actual_tread_mm - w.predicted_tread_mm) >= 0.001)
)::text AS payload
FROM tire_wear_data_points w
LEFT JOIN (
  SELECT tire_setup_id, count(*) AS cnt
  FROM vehicle_tire_tread_measurements
  GROUP BY tire_setup_id
) m ON m.tire_setup_id = w.tire_set_id
WHERE w.created_at >= now() - interval '60 days';

-- 4) Duplicate snapshots (identical metrics same minute)
SELECT 'DUPLICATE_SNAPSHOTS' AS section, json_build_object(
  'duplicate_groups', count(*),
  'extra_rows', coalesce(sum(cnt - 1), 0)
)::text AS payload
FROM (
  SELECT vehicle_id, tire_set_id, date_trunc('minute', snapshot_date), estimated_tread_mm, estimated_remaining_km, confidence_score, count(*) AS cnt
  FROM tire_health_snapshots
  WHERE snapshot_date >= now() - interval '60 days'
  GROUP BY 1,2,3,4,5,6
  HAVING count(*) > 1
) d;

-- 5) Duplicate wear data points
SELECT 'DUPLICATE_WEAR_POINTS' AS section, json_build_object(
  'duplicate_groups', count(*),
  'extra_rows', coalesce(sum(cnt - 1), 0)
)::text AS payload
FROM (
  SELECT vehicle_id, tire_set_id, axle, distance_km, predicted_tread_mm, actual_tread_mm, date_trunc('minute', created_at), count(*) AS cnt
  FROM tire_wear_data_points
  WHERE created_at >= now() - interval '60 days'
  GROUP BY 1,2,3,4,5,6,7
  HAVING count(*) > 1
) d;

-- 6) Rapid recalculations (<5 min apart)
SELECT 'RAPID_RECALCS' AS section, json_build_object(
  'vehicle_set_pairs', count(*),
  'max_burst', coalesce(max(cnt), 0)
)::text AS payload
FROM (
  SELECT vehicle_id, tire_set_id, date_trunc('hour', created_at) AS hr, count(*) AS cnt
  FROM tire_events
  WHERE type='RECALCULATION' AND created_at >= now() - interval '60 days'
  GROUP BY 1,2,3
  HAVING count(*) > 2
) r;

-- 7) Per-vehicle fleet coverage (anonymized rank)
SELECT 'FLEET_ROW' AS section, row_to_json(t)::text AS payload
FROM (
  SELECT
    row_number() OVER (ORDER BY v.id) AS anon_rank,
    CASE WHEN v.dimo_vehicle_id IS NOT NULL THEN 'dimo' ELSE 'manual' END AS provider,
    coalesce(v.fuel_type::text, 'unknown') AS powertrain,
    coalesce(v.vehicle_type::text, 'unknown') AS vehicle_class,
    s.status AS setup_status,
    s.tire_season,
    extract(day from now() - coalesce(s.installed_at, s.created_at))::int AS setup_age_days,
    (s.ai_tire_spec IS NOT NULL) AS tire_spec_present,
    coalesce(s.reference_new_tread_source, 'unknown') AS spec_source,
    s.confidence_score,
    s.confidence_label,
    coalesce((s.ai_tire_spec::jsonb ->> 'userConfirmedSpec')::boolean, false) AS user_confirmed_spec,
    (s.initial_tread_front_mm IS NOT NULL OR s.initial_tread_rear_mm IS NOT NULL OR s.initial_tread_depth_mm IS NOT NULL) AS initial_tread_present,
    s.initial_tread_source,
    exists (
      SELECT 1 FROM tires t WHERE t.tire_set_id = s.id AND t.initial_tread_depth_mm = 8.0
        AND s.initial_tread_front_mm IS NULL AND s.initial_tread_rear_mm IS NULL AND s.initial_tread_depth_mm IS NULL
    ) AS uses_8mm_default,
    (SELECT count(*) FROM vehicle_tire_tread_measurements m WHERE m.tire_setup_id = s.id) AS manual_measurements,
    (SELECT max(m.measured_at) FROM vehicle_tire_tread_measurements m WHERE m.tire_setup_id = s.id) AS last_measurement_at,
    round(s.total_km_on_set::numeric, 1) AS total_km_on_set,
    round(vls.odometer_km::numeric, 1) AS current_odometer_km,
    round(s.installed_odometer_km::numeric, 1) AS installed_odometer_km,
    round((vls.odometer_km - s.installed_odometer_km)::numeric, 1) AS odometer_delta_km,
    (SELECT count(*) FROM tire_health_snapshots hs WHERE hs.vehicle_id = v.id AND hs.snapshot_date >= now() - interval '60 days') AS snapshots_60d,
    (SELECT count(*) FROM tire_wear_data_points wp WHERE wp.vehicle_id = v.id AND wp.created_at >= now() - interval '60 days') AS wear_points_60d,
    (SELECT count(*) FROM tire_wear_data_points wp WHERE wp.vehicle_id = v.id AND wp.created_at >= now() - interval '60 days' AND abs(wp.actual_tread_mm - wp.predicted_tread_mm) >= 0.001) AS gt_points_60d,
    (SELECT count(*) FROM tire_wear_data_points wp WHERE wp.vehicle_id = v.id AND wp.created_at >= now() - interval '60 days' AND abs(wp.actual_tread_mm - wp.predicted_tread_mm) < 0.001) AS synthetic_points_60d,
    (vls.tire_pressure_fl IS NOT NULL OR vls.tire_pressure_fr IS NOT NULL OR vls.tire_pressure_rl IS NOT NULL OR vls.tire_pressure_rr IS NOT NULL) AS pressure_present,
    s.health_status,
    s.overall_health_percent,
    s.overall_remaining_km
  FROM vehicles v
  JOIN vehicle_tire_setups s ON s.vehicle_id = v.id AND s.status = 'ACTIVE' AND s.removed_at IS NULL
  LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
) t;

-- 8) Trip km per vehicle (60d completed trips)
SELECT 'TRIP_KM_ROW' AS section, row_to_json(t)::text AS payload
FROM (
  SELECT
    row_number() OVER (ORDER BY v.id) AS anon_rank,
    count(t.id) AS trip_count,
    round(coalesce(sum(t.distance_km),0)::numeric, 1) AS trip_km_sum,
    count(*) FILTER (WHERE t.behavior_enrichment_status = 'COMPLETED') AS enriched_trips
  FROM vehicles v
  JOIN vehicle_tire_setups s ON s.vehicle_id = v.id AND s.status='ACTIVE' AND s.removed_at IS NULL
  LEFT JOIN vehicle_trips t ON t.vehicle_id = v.id
    AND t.trip_status = 'COMPLETED'
    AND t.end_time >= now() - interval '60 days'
    AND t.distance_km IS NOT NULL
  GROUP BY v.id
) t;

-- 9) Km plausibility flags
SELECT 'KM_PLAUSIBILITY' AS section, row_to_json(t)::text AS payload
FROM (
  SELECT
    row_number() OVER (ORDER BY v.id) AS anon_rank,
    round(s.total_km_on_set::numeric,1) AS total_km_on_set,
    round(coalesce(trip.trip_km,0)::numeric,1) AS trip_km_sum,
    round((vls.odometer_km - s.installed_odometer_km)::numeric,1) AS odometer_delta,
    round(abs(s.total_km_on_set - coalesce(trip.trip_km,0))::numeric,1) AS abs_dev_trip,
    CASE
      WHEN s.installed_odometer_km IS NULL OR vls.odometer_km IS NULL THEN 'not_evaluable'
      WHEN abs(s.total_km_on_set - coalesce(trip.trip_km,0)) <= greatest(50, coalesce(trip.trip_km,0) * 0.15) THEN 'plausible'
      WHEN abs(s.total_km_on_set - coalesce(trip.trip_km,0)) <= greatest(200, coalesce(trip.trip_km,0) * 0.35) THEN 'slight_deviation'
      ELSE 'strong_deviation'
    END AS classification,
    CASE
      WHEN coalesce(trip.trip_km,0) = 0 AND s.total_km_on_set > 0 THEN 'trip_enrich_not_called_or_no_trips'
      WHEN s.total_km_on_set > coalesce(trip.trip_km,0) * 1.2 THEN 'possible_double_count_or_manual_km'
      WHEN s.total_km_on_set < coalesce(trip.trip_km,0) * 0.8 THEN 'trips_not_applied_to_setup'
      ELSE 'within_tolerance'
    END AS likely_cause
  FROM vehicles v
  JOIN vehicle_tire_setups s ON s.vehicle_id = v.id AND s.status='ACTIVE' AND s.removed_at IS NULL
  LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
  LEFT JOIN (
    SELECT vehicle_id, sum(distance_km) AS trip_km, count(*) AS trip_count
    FROM vehicle_trips
    WHERE trip_status='COMPLETED' AND end_time >= now() - interval '60 days' AND distance_km IS NOT NULL
    GROUP BY vehicle_id
  ) trip ON trip.vehicle_id = v.id
) t;

-- 10) ClickHouse trip mirror check (via psql only - CH separate)
SELECT 'CH_NOTE' AS section, '{"note":"ClickHouse queried separately"}'::text AS payload;
