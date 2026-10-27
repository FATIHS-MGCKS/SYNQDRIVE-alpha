#!/usr/bin/env bash
# Read-only production evidence export for Tire V3 P3 (four reference vehicles).
# Requires SSH as synqdrive-admin to Hostinger VPS. No writes.
set -euo pipefail
HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
DIR="$(cd "$(dirname "$0")" && pwd)"
VIDS="'68868291-5478-42cd-b0c4-cc77b2a78e21','19fedd4b-c4e8-4de8-a125-dab293326e7e','c10351f8-b6a2-4258-947f-631aeaa6d359','8c850ff1-4201-432b-af2e-2711dbc7ca48'"

ssh -o BatchMode=yes "synqdrive-admin@${HOST}" "sudo -u postgres psql -d synqdrive -t -A -c \"
SELECT json_build_object(
  'setups', (SELECT coalesce(json_agg(s ORDER BY installed_at DESC), '[]'::json) FROM (
    SELECT id, vehicle_id, status, tire_season, installed_at, installed_odometer_km, odometer_anchor_status, removed_at
    FROM vehicle_tire_setups WHERE vehicle_id IN (${VIDS})
  ) s),
  'mountPeriods', (SELECT coalesce(json_agg(mp ORDER BY installed_at), '[]'::json) FROM (
    SELECT mp.id, mp.tire_setup_id, mp.installed_at, mp.removed_at, mp.installed_odometer_km, mp.odometer_anchor_status, s.vehicle_id
    FROM vehicle_tire_setup_mount_periods mp
    JOIN vehicle_tire_setups s ON s.id = mp.tire_setup_id
    WHERE s.vehicle_id IN (${VIDS})
  ) mp),
  'measurements', (SELECT coalesce(json_agg(m ORDER BY measured_at DESC), '[]'::json) FROM (
    SELECT id, vehicle_id, tire_setup_id, front_left_mm, front_right_mm, rear_left_mm, rear_right_mm,
           odometer_at_measurement, source, evidence_source, measured_at, is_calibration_point
    FROM vehicle_tire_tread_measurements WHERE vehicle_id IN (${VIDS})
  ) m),
  'latestV2Snapshots', (SELECT coalesce(json_agg(ls), '[]'::json) FROM (
    SELECT DISTINCT ON (vehicle_id) id, vehicle_id, tire_set_id, snapshot_date, odometer_km, estimated_tread_mm,
           model_version, prediction_generated_at
    FROM tire_health_snapshots WHERE vehicle_id IN (${VIDS})
    ORDER BY vehicle_id, snapshot_date DESC
  ) ls),
  'ledgerTripCount', (SELECT coalesce(json_object_agg(vehicle_id, cnt), '{}'::json) FROM (
    SELECT vehicle_id, count(*)::int as cnt FROM tire_trip_usage_ledger
    WHERE vehicle_id IN (${VIDS}) AND invalidated_at IS NULL GROUP BY vehicle_id
  ) t),
  'ds4ShadowRowCount', (SELECT coalesce(json_object_agg(vehicle_id, cnt), '{}'::json) FROM (
    SELECT vehicle_id, count(*)::int as cnt FROM tire_ds4_motion_shadow_input_v1
    WHERE vehicle_id IN (${VIDS}) GROUP BY vehicle_id
  ) d)
);
\"" > "${DIR}/production-evidence-bundle.json"

python3 -m json.tool "${DIR}/production-evidence-bundle.json" > "${DIR}/production-evidence-bundle.pretty.json"
echo "Wrote ${DIR}/production-evidence-bundle.json"
