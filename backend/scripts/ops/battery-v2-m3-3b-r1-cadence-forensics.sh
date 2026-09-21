#!/usr/bin/env bash
# Read-only production forensics for M3.3B R1 parked LV cadence.
# Requires VPS sudo access to source /opt/synqdrive/shared/backend.env
set -euo pipefail

if [[ "${1:-}" != "--local-vps" ]]; then
  echo "Run on production VPS as: bash $0 --local-vps" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/backend.env
set +a
DB="${DATABASE_URL%%\?*}"

psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
WITH ice_r1 AS (
  SELECT v.id AS vehicle_id
  FROM vehicles v
  WHERE v.hardware_type = 'LTE_R1'
    AND v.fuel_type IN ('GASOLINE', 'DIESEL')
),
parked_rest AS (
  SELECT
    m.vehicle_id,
    COALESCE(m.provider_timestamp, m.observed_at) AS provider_at
  FROM battery_measurements m
  JOIN ice_r1 i ON i.vehicle_id = m.vehicle_id
  WHERE m.type = 'LIVE_VOLTAGE'
    AND m.quality = 'VALID'
    AND (m.context->>'engineRunning')::boolean IS FALSE
    AND COALESCE((m.context->>'speedKmh')::float, 0) <= 0.5
),
intervals AS (
  SELECT
    EXTRACT(EPOCH FROM (
      provider_at - LAG(provider_at) OVER (PARTITION BY vehicle_id ORDER BY provider_at)
    )) * 1000 AS delta_ms
  FROM parked_rest
)
SELECT
  count(*) FILTER (WHERE delta_ms BETWEEN 4*3600000 AND 12*3600000) AS r1_interval_count,
  min(delta_ms) FILTER (WHERE delta_ms BETWEEN 4*3600000 AND 12*3600000)::bigint AS r1_min_ms,
  max(delta_ms) FILTER (WHERE delta_ms BETWEEN 4*3600000 AND 12*3600000)::bigint AS r1_max_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY delta_ms)
    FILTER (WHERE delta_ms BETWEEN 4*3600000 AND 12*3600000) AS median_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY delta_ms)
    FILTER (WHERE delta_ms BETWEEN 4*3600000 AND 12*3600000) AS p95_ms
FROM intervals;
SQL
