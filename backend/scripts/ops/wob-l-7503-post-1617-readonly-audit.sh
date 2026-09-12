#!/usr/bin/env bash
# Read-only Production audit helper — WOB L 7503 POST-#1617 physical acceptance.
# Safe: SELECT-only SQL + log grep. No mutations.
set -euo pipefail

PSQL=(sudo -n -u postgres psql -d synqdrive -P pager=off -v ON_ERROR_STOP=1)

echo "=== PHASE 0: DEPLOYMENT ==="
REL=$(readlink -f /opt/synqdrive/current)
echo "CURRENT_LINK=$REL"
echo "RELEASE=$(basename "$REL")"
if [[ -f "$REL/.git/refs/heads/main" ]]; then
  echo "PRODUCTION_SHA=$(cat "$REL/.git/refs/heads/main")"
elif [[ -f "$REL/.git/HEAD" ]]; then
  echo "PRODUCTION_SHA=$(tr -d '\n' < "$REL/.git/HEAD")"
fi
for app in synqdrive synqdrive-b; do
  cwd=$(sudo -n pm2 describe "$app" 2>/dev/null | awk -F'│' '/exec cwd/{gsub(/ /,""); print $2; exit}' || true)
  echo "PM2_${app}_cwd=$cwd"
  echo "PM2_${app}_status=$(sudo -n pm2 describe "$app" 2>/dev/null | awk -F'│' '/status/{gsub(/ /,""); print $2; exit}' || true)"
done

echo
echo "=== PHASE 1: VEHICLE ==="
"${PSQL[@]}" -c "
SELECT v.id AS vehicle_id, v.license_plate, v.make, v.model, vls.dimo_token_id
FROM vehicles v
LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
WHERE v.license_plate ILIKE '%7503%'
   OR v.vehicle_name ILIKE '%7503%'
ORDER BY v.license_plate;
"

VEHICLE_ID=$("${PSQL[@]}" -tAc "
SELECT v.id FROM vehicles v
WHERE v.license_plate ILIKE '%7503%'
ORDER BY v.license_plate LIMIT 1;
" | tr -d '[:space:]')

if [[ -z "$VEHICLE_ID" ]]; then
  echo "VEHICLE_NOT_FOUND=YES"
  exit 2
fi
echo "CANONICAL_VEHICLE_ID=$VEHICLE_ID"

echo
echo "=== PHASE 1b: OVERLAPPING TRIPS (19:00-20:30 UTC) ==="
"${PSQL[@]}" -c "
SELECT t.id, t.trip_status, t.start_time, t.end_time, t.created_at,
       t.raw_detection_meta->>'startDetectionMode' AS start_detection_mode,
       t.raw_detection_meta->>'startSource' AS start_source
FROM vehicle_trips t
WHERE t.vehicle_id = '$VEHICLE_ID'
  AND t.start_time >= '2026-09-12T19:00:00Z'
  AND t.start_time <= '2026-09-12T20:30:00Z'
ORDER BY t.start_time;
"

echo
echo "=== DETECTION STATE NOW ==="
"${PSQL[@]}" -c "
SELECT d.state, d.active_trip_id, d.possible_end_at, d.possible_end_entered_at,
       d.end_validation_attempts, d.end_detection_mode, d.last_meaningful_movement_at,
       d.last_activity_at, d.last_evidence_summary
FROM vehicle_trip_detection_states d
WHERE d.vehicle_id = '$VEHICLE_ID';
"

# Prefer the ongoing segment after LIVE gap split (longest / latest start in window).
TRIP_ID=$("${PSQL[@]}" -tAc "
SELECT t.id FROM vehicle_trips t
WHERE t.vehicle_id = '$VEHICLE_ID'
  AND t.start_time >= '2026-09-12T19:00:00Z'
  AND t.start_time <= '2026-09-12T20:30:00Z'
ORDER BY (t.trip_status = 'ONGOING') DESC, t.start_time DESC
LIMIT 1;
" | tr -d '[:space:]')
echo "CANONICAL_TRIP_ID=$TRIP_ID"

if [[ -n "$TRIP_ID" ]]; then
  echo
  echo "=== TRACKING RUNS (trip) ==="
  "${PSQL[@]}" -c "
  SELECT created_at, run_type, state_at_run, result_state,
         result_summary->>'reason' AS reason,
         result_summary->>'completedAttempt' AS completed_attempt,
         duration_ms
  FROM vehicle_trip_tracking_runs
  WHERE trip_id = '$TRIP_ID'
  ORDER BY created_at;
  "
fi

echo
echo "=== TRACKING RUNS (vehicle window) ==="
"${PSQL[@]}" -c "
SELECT created_at, run_type, trip_id, state_at_run, result_state,
       result_summary->>'reason' AS reason,
       duration_ms
FROM vehicle_trip_tracking_runs
WHERE vehicle_id = '$VEHICLE_ID'
  AND created_at >= '2026-09-12T19:00:00Z'
  AND created_at <= '2026-09-12T20:30:00Z'
ORDER BY created_at;
"

echo
echo "=== END_VALIDATION SUMMARY ==="
"${PSQL[@]}" -c "
SELECT COUNT(*) FILTER (WHERE run_type = 'END_VALIDATION') AS ev_runs,
       COUNT(*) FILTER (WHERE run_type = 'END_VALIDATION' AND result_summary->>'reason' = 'cusum_still_ongoing') AS cusum_ongoing,
       COUNT(*) FILTER (WHERE run_type = 'POSSIBLE_END_CHECK') AS pec_runs,
       COUNT(*) FILTER (WHERE run_type = 'FINALIZATION_CHECK') AS fin_runs
FROM vehicle_trip_tracking_runs
WHERE vehicle_id = '$VEHICLE_ID'
  AND created_at >= '2026-09-12T19:00:00Z';
"

echo
echo "=== PM2 LOG GREP (bounded window) ==="
LOG_DIR=/root/.pm2/logs
for log in synqdrive-out synqdrive-b-out; do
  f="$LOG_DIR/${log}.log"
  if [[ -f "$f" ]]; then
    echo "--- $log ---"
    sudo -n grep -E "$VEHICLE_ID|${TRIP_ID:-NO_TRIP}|possible_end|end_validation|cusum|finalize|stopBoundary|POSSIBLE_END" "$f" 2>/dev/null \
      | grep '2026-09-12T19:' | tail -80 || true
  fi
done
