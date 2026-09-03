#!/usr/bin/env bash
# Battery V2 M3.1 — read-only 6-hour post-activation validation.
# Compare against BATTERY_V2_FULL_FLEET_T0 (default: 2026-09-03T11:08:02Z).
#
# Usage on VPS:
#   sudo BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z \
#     bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-1-six-hour-validation.sh
#
# Or from Cloud Agent (stdin pipe — helper dir is NOT auto-detected):
#   BATTERY_V2_OPS_SCRIPT_DIR=/path/to/backend/scripts/ops \
#     ssh synqdrive-admin@srv1374778.hstgr.cloud 'sudo -n bash -s' \
#     < backend/scripts/ops/battery-v2-m3-1-six-hour-validation.sh
set -eo pipefail

ACTIVATION_T0="${BATTERY_V2_FULL_FLEET_T0:-2026-09-03T11:08:02Z}"
BACKEND_ENV="${BATTERY_V2_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

_resolve_script_dir() {
  if [[ -n "${BATTERY_V2_OPS_SCRIPT_DIR:-}" ]]; then
    printf '%s\n' "${BATTERY_V2_OPS_SCRIPT_DIR}"
    return 0
  fi
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && "$src" != "/dev/stdin" && "$src" != "bash" ]]; then
    cd "$(dirname "$src")" && pwd
    return 0
  fi
  cat >&2 <<'EOF'
ERROR: Cannot resolve Battery V2 ops script directory.
When piping this script via stdin (e.g. Cloud Agent SSH), set:
  BATTERY_V2_OPS_SCRIPT_DIR=/absolute/path/to/backend/scripts/ops
The directory must contain battery-v2-m3-1-production-snapshot.sh
EOF
  return 1
}

SCRIPT_DIR="$(_resolve_script_dir)" || exit 1
SNAPSHOT_HELPER="${SCRIPT_DIR}/battery-v2-m3-1-production-snapshot.sh"
if [[ ! -f "$SNAPSHOT_HELPER" ]]; then
  echo "ERROR: Missing helper script: ${SNAPSHOT_HELPER}" >&2
  echo "Set BATTERY_V2_OPS_SCRIPT_DIR to the directory that contains battery-v2-m3-1-production-snapshot.sh" >&2
  exit 1
fi

echo "=============================================="
echo " Battery V2 M3.1 — 6-hour validation audit"
echo " Activation T0: ${ACTIVATION_T0}"
echo " Audit time:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================="

export BATTERY_V2_SINCE_ISO="${ACTIVATION_T0}"
bash "${SNAPSHOT_HELPER}" SIX_HOUR_AUDIT

set +u; set -a; source "$BACKEND_ENV"; set +a
PSQL_URL="${DATABASE_URL%%\?*}"

echo "--- CONNECTED FLEET (6h evidence) ---"
psql "$PSQL_URL" -c "
SELECT v.id, LEFT(COALESCE(v.license_plate,'?'),10) plate, v.fuel_type::text,
  (SELECT MAX(bm.created_at) FROM battery_measurements bm WHERE bm.vehicle_id=v.id) AS latest_meas,
  (SELECT MAX(bm.created_at) FILTER (WHERE bm.created_at >= '${ACTIVATION_T0}'::timestamptz) FROM battery_measurements bm WHERE bm.vehicle_id=v.id) AS meas_since_t0,
  (SELECT MAX(ba.computed_at) FROM battery_assessments ba WHERE ba.vehicle_id=v.id AND ba.scope='LV') AS latest_assess,
  (SELECT MAX(ba.computed_at) FILTER (WHERE ba.computed_at >= '${ACTIVATION_T0}'::timestamptz) FROM battery_assessments ba WHERE ba.vehicle_id=v.id AND ba.scope='LV') AS assess_since_t0,
  (SELECT COUNT(*) FROM battery_publications bp WHERE bp.vehicle_id=v.id AND bp.created_at >= '${ACTIVATION_T0}'::timestamptz) AS pubs_since_t0,
  (SELECT MAX(bp.created_at) FROM battery_publications bp WHERE bp.vehicle_id=v.id) AS latest_pub,
  CASE
    WHEN (SELECT MAX(bm.created_at) FROM battery_measurements bm WHERE bm.vehicle_id=v.id) IS NULL THEN 'NO_MEASUREMENT_DATA'
    WHEN (SELECT MAX(bm.created_at) FILTER (WHERE bm.created_at >= '${ACTIVATION_T0}'::timestamptz) FROM battery_measurements bm WHERE bm.vehicle_id=v.id) IS NULL THEN 'NO_NEW_DATA_SINCE_T0'
    WHEN (SELECT COUNT(*) FROM battery_publications bp WHERE bp.vehicle_id=v.id AND bp.created_at >= '${ACTIVATION_T0}'::timestamptz) > 0 THEN 'PUBLISHED_SINCE_T0'
    WHEN (SELECT MAX(ba.computed_at) FILTER (WHERE ba.computed_at >= '${ACTIVATION_T0}'::timestamptz) FROM battery_assessments ba WHERE ba.vehicle_id=v.id AND ba.scope='LV') IS NOT NULL THEN 'ASSESSED_AWAITING_PUBLICATION'
    ELSE 'MEASURED_AWAITING_ASSESSMENT'
  END AS pipeline_status
FROM vehicles v
INNER JOIN vehicle_latest_states vls ON vls.vehicle_id=v.id
WHERE vls.dimo_token_id IS NOT NULL
ORDER BY meas_since_t0 DESC NULLS LAST, latest_meas DESC NULLS LAST;"

echo "--- REST TARGET TYPE BREAKDOWN (30m / 6h since T0) ---"
psql "$PSQL_URL" -c "
SELECT bm.type, COUNT(*) total,
  COUNT(*) FILTER (WHERE bm.created_at >= '${ACTIVATION_T0}'::timestamptz) since_t0,
  MIN(bm.created_at) FILTER (WHERE bm.created_at >= '${ACTIVATION_T0}'::timestamptz) first_since_t0,
  MAX(bm.created_at) FILTER (WHERE bm.created_at >= '${ACTIVATION_T0}'::timestamptz) last_since_t0
FROM battery_measurements bm
INNER JOIN vehicle_latest_states vls ON vls.vehicle_id=bm.vehicle_id
WHERE vls.dimo_token_id IS NOT NULL
GROUP BY 1 ORDER BY 1;"

echo "--- PUBLICATIONS SINCE T0 (detail) ---"
psql "$PSQL_URL" -c "
SELECT bp.vehicle_id, bp.id, bp.status, bp.published_at, bp.idempotency_key, bp.assessment_id
FROM battery_publications bp
WHERE bp.created_at >= '${ACTIVATION_T0}'::timestamptz
ORDER BY bp.created_at;"

echo "--- CHECKLIST ---"
cat <<EOF
[ ] BATTERY_V2_PUBLICATION_ENABLED=true (file + PM2 effective)
[ ] BATTERY_V2_REST_SHADOW_ENABLED=false
[ ] Both PM2 replicas online, no crash loop since T0
[ ] Exactly one scheduler leader
[ ] failed_post_activation delta = 0 (or explain historical-only)
[ ] dup_assess / dup_pub / dup_customer_pub = 0
[ ] reservation leak count = 0
[ ] At least one connected vehicle with meas_since_t0 OR documented idle fleet
[ ] If eligible evidence exists: battery_publications row created since T0
[ ] 30m REST_60M and 6h REST_6H paths observed where vehicles are active
EOF

echo "=== END 6-hour audit ==="
