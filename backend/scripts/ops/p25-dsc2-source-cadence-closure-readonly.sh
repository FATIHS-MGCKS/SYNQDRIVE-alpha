#!/usr/bin/env bash
# P2.5 DSC-2 read-only audit — PostgreSQL + ClickHouse (no node deps).
set -euo pipefail
set +u
set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/backend.env
set +a
DB="${DATABASE_URL%%\?*}"
T7_START='2026-09-18 09:33:25+00'
T7_7D_END='2026-09-25 09:33:25+00'

ch() {
  sudo docker exec synqdrive-clickhouse clickhouse-client --format TabSeparated -q "$1"
}

echo '{"exportedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","section":"DSC2"}'

VEH_SQL="SELECT v.id::text, dv.token_id, v.license_plate FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id WHERE dv.token_id IN (186946,187336,187361,187784,192922)"
mapfile -t VEH_LINES < <(psql "$DB" -t -A -F'|' -c "$VEH_SQL")
IDS=()
for line in "${VEH_LINES[@]}"; do
  [[ -z "$line" ]] && continue
  IDS+=("'${line%%|*}'")
done
ID_CSV=$(IFS=,; echo "${IDS[*]}")

echo "--- FLEET_LV_STANDBY_GAPS_T7_7D ---"
psql "$DB" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
WITH r9 AS (
  SELECT v.id AS vehicle_id, dv.token_id
  FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
  WHERE dv.token_id IN (187336,187361,187784,192922)
),
lv AS (
  SELECT m.vehicle_id, m.provider_timestamp AS pt
  FROM battery_measurements m JOIN r9 ON r9.vehicle_id = m.vehicle_id
  WHERE m.type = 'LIVE_VOLTAGE' AND m.quality = 'VALID' AND m.provider_timestamp IS NOT NULL
    AND m.provider_timestamp >= '${T7_START}' AND m.provider_timestamp <= '${T7_7D_END}'
    AND (m.context->>'engineRunning')::boolean IS FALSE
    AND (m.context->>'speedKmh')::float IS NOT NULL AND (m.context->>'speedKmh')::float <= 0.5
    AND (m.context->>'ignitionOn')::boolean IS FALSE
    AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
    AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
),
dedup AS (SELECT DISTINCT vehicle_id, pt FROM lv),
gaps AS (
  SELECT EXTRACT(EPOCH FROM (pt - LAG(pt) OVER (PARTITION BY vehicle_id ORDER BY pt))) AS gap_s FROM dedup
)
SELECT 'BATTERY_VOLTAGE', count(*) FILTER (WHERE gap_s > 60),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2),
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2),
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2),
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2),
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2),
  round(max(gap_s) FILTER (WHERE gap_s > 60)::numeric,2)
FROM gaps;"

echo "--- PER_VEHICLE_LV ---"
psql "$DB" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
WITH r9 AS (
  SELECT v.id AS vehicle_id, dv.token_id, v.license_plate
  FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
  WHERE dv.token_id IN (187336,187361,187784,192922)
),
lv AS (
  SELECT m.vehicle_id, m.provider_timestamp AS pt
  FROM battery_measurements m JOIN r9 ON r9.vehicle_id = m.vehicle_id
  WHERE m.type = 'LIVE_VOLTAGE' AND m.quality = 'VALID' AND m.provider_timestamp IS NOT NULL
    AND m.provider_timestamp >= '${T7_START}' AND m.provider_timestamp <= '${T7_7D_END}'
    AND (m.context->>'engineRunning')::boolean IS FALSE
    AND (m.context->>'speedKmh')::float IS NOT NULL AND (m.context->>'speedKmh')::float <= 0.5
    AND (m.context->>'ignitionOn')::boolean IS FALSE
    AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
    AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
),
dedup AS (SELECT DISTINCT vehicle_id, pt FROM lv),
gaps AS (
  SELECT vehicle_id,
    EXTRACT(EPOCH FROM (pt - LAG(pt) OVER (PARTITION BY vehicle_id ORDER BY pt))) AS gap_s
  FROM dedup
)
SELECT r9.token_id, r9.license_plate,
  count(*) FILTER (WHERE gap_s > 60),
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)/3600)::numeric,2),
  round((percentile_cont(0.9) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)/3600)::numeric,2),
  round((percentile_cont(0.95) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)/3600)::numeric,2),
  round(100.0 * count(*) FILTER (WHERE gap_s BETWEEN 7*3600 AND 9*3600) / NULLIF(count(*) FILTER (WHERE gap_s > 60),0),1),
  round(100.0 * count(*) FILTER (WHERE gap_s BETWEEN 6*3600 AND 10*3600) / NULLIF(count(*) FILTER (WHERE gap_s > 60),0),1)
FROM gaps g JOIN r9 ON r9.vehicle_id = g.vehicle_id
GROUP BY r9.token_id, r9.license_plate ORDER BY 1;"

echo "--- CH_TOP_LEVEL_STANDBY_GAPS_T7_7D ---"
ch "
WITH snaps AS (
  SELECT vehicle_id, recorded_at
  FROM synqdrive.telemetry_snapshots
  WHERE vehicle_id IN (${ID_CSV})
    AND recorded_at >= parseDateTime64BestEffort('2026-09-18T09:33:25Z')
    AND recorded_at <= parseDateTime64BestEffort('2026-09-25T09:33:25Z')
    AND (speed_kmh IS NULL OR speed_kmh <= 0.5)
    AND (is_ignition_on IS NULL OR is_ignition_on = 0)
),
dedup AS (SELECT DISTINCT vehicle_id, recorded_at FROM snaps),
gaps AS (
  SELECT dateDiff('second', lag(recorded_at) OVER (PARTITION BY vehicle_id ORDER BY recorded_at), recorded_at) AS gap_s
  FROM dedup
)
SELECT 'TOP_LEVEL_SOURCE',
  countIf(gap_s > 60),
  quantile(0.5)(gap_s),
  quantile(0.75)(gap_s),
  quantile(0.9)(gap_s),
  quantile(0.95)(gap_s),
  quantile(0.99)(gap_s),
  max(gap_s)
FROM gaps;"

echo "--- CH_IGNITION_GAPS ---"
ch "
WITH ev AS (
  SELECT vehicle_id, changed_at
  FROM synqdrive.telemetry_state_changes
  WHERE vehicle_id IN (${ID_CSV})
    AND signal_name = 'ignition'
    AND changed_at >= parseDateTime64BestEffort('2026-09-18T09:33:25Z')
    AND changed_at <= parseDateTime64BestEffort('2026-09-25T09:33:25Z')
),
gaps AS (
  SELECT dateDiff('second', lag(changed_at) OVER (PARTITION BY vehicle_id ORDER BY changed_at), changed_at) AS gap_s
  FROM ev
)
SELECT 'IGNITION', countIf(gap_s > 60), quantile(0.95)(gap_s) FROM gaps;"

echo "--- OBD_PROXY_PHYSICAL_STATE_SNAPSHOT_GAPS ---"
psql "$DB" -t -A -F'|' -c "
WITH ev AS (
  SELECT vehicle_id, evidence_observed_at AS t
  FROM device_connection_physical_state_transitions
  WHERE vehicle_id IN (SELECT v.id FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id WHERE dv.token_id IN (186946,187336,187361,187784,192922))
    AND evidence_source::text LIKE '%SNAPSHOT%'
    AND evidence_observed_at >= '${T7_START}' AND evidence_observed_at <= '${T7_7D_END}'
),
gaps AS (
  SELECT EXTRACT(EPOCH FROM (t - LAG(t) OVER (PARTITION BY vehicle_id ORDER BY t))) AS gap_s FROM ev
)
SELECT 'OBD_PROXY', count(*) FILTER (WHERE gap_s > 60),
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY gap_s) FILTER (WHERE gap_s > 60)::numeric,2)
FROM gaps;"

echo "--- CONTROL_POLLS_T7_7D ---"
psql "$DB" -t -A -c "
SELECT count(*) FROM dimo_poll_logs d
JOIN vehicles v ON v.id = d.vehicle_id
JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
WHERE dv.token_id IN (186946,187336,187361,187784,192922)
  AND d.job_type = 'SNAPSHOT' AND d.status = 'SUCCESS'
  AND d.started_at >= '${T7_START}' AND d.started_at <= '${T7_7D_END}';"
