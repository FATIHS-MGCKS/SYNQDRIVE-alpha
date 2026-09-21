#!/usr/bin/env bash
# M3.3B.1 read-only strict cadence forensics (provider_timestamp only, session segmentation).
set -euo pipefail

if [[ "${1:-}" != "--local-vps" ]]; then
  echo "Run on production VPS: bash $0 --local-vps" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/backend.env
set +a
DB="${DATABASE_URL%%\?*}"

psql "$DB" -v ON_ERROR_STOP=1 -f - <<'SQL'
\echo '=== M3.3B.1 strict cohort (ICE LTE_R1) ==='
WITH ice AS (
  SELECT id AS vehicle_id FROM vehicles
  WHERE hardware_type='LTE_R1' AND fuel_type IN ('GASOLINE','DIESEL')
),
lv AS (
  SELECT m.*, (m.context->>'engineRunning')::boolean AS er,
    (m.context->>'speedKmh')::float AS spd,
    (m.context->>'ignitionOn')::boolean AS ign,
    COALESCE((m.context->>'isLvCharging')::boolean,false) AS lv_ch,
    COALESCE((m.context->>'isHvCharging')::boolean,false) AS hv_ch
  FROM battery_measurements m JOIN ice i ON i.vehicle_id=m.vehicle_id
  WHERE m.type='LIVE_VOLTAGE' AND m.quality='VALID' AND (m.context->>'engineRunning')::boolean IS FALSE
)
SELECT
  count(*) AS total_parked_engine_off_rows,
  count(*) FILTER (WHERE provider_timestamp IS NOT NULL) AS provider_timestamp_qualified_rows,
  count(*) FILTER (WHERE provider_timestamp IS NULL) AS rows_excluded_no_provider_timestamp,
  count(*) FILTER (WHERE provider_timestamp IS NOT NULL AND er IS FALSE AND spd IS NOT NULL AND spd<=0.5 AND ign IS FALSE AND NOT lv_ch AND NOT hv_ch) AS strict_rest_observations,
  count(*) FILTER (WHERE provider_timestamp IS NOT NULL AND er IS FALSE AND (spd IS NULL OR spd<=0.5)) AS relaxed_rest_observations,
  count(*) FILTER (WHERE provider_timestamp IS NOT NULL AND er IS FALSE AND spd IS NULL) AS unknown_speed_excluded_from_strict,
  count(*) FILTER (WHERE provider_timestamp IS NOT NULL AND er IS FALSE AND spd IS NOT NULL AND spd<=0.5 AND (lv_ch OR hv_ch)) AS charging_contaminated_excluded
FROM lv;

\echo '=== Session-segmented inter-arrival + rest-age + rung residual ==='
-- (same core query block as architecture doc — see M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md §M3.3B.1)
SQL

echo "For full bin/residual output see architecture forensic doc or extend this script."
