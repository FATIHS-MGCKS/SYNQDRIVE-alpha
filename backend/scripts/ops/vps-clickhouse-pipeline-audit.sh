#!/usr/bin/env bash
#
# vps-clickhouse-pipeline-audit.sh — Read-only analytics pipeline health snapshot.
#
# Phase 2D.6: mirror freshness, ingest rates, duplicate samples, HF coverage hints.
#
set -euo pipefail

DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CH_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_USER="${CLICKHOUSE_USER:-synqdrive}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
PG_URL="${DATABASE_URL:-}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

ch_q() {
  clickhouse-client --host "$CH_HOST" --port "$CH_PORT" \
    --user "$CH_USER" ${CH_PASSWORD:+--password "$CH_PASSWORD"} "$@"
}

P1_ISSUES=0

section() {
  echo ""
  echo "================================================================================"
  echo "== $*"
  echo "================================================================================"
}

if ! ch_q --query "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: cannot connect to ClickHouse" >&2
  exit 2
fi

section "Mirror freshness lag (seconds since newest event)"
ch_q --format PrettyCompact <<SQL || true
SELECT
  'telemetry_snapshots' AS table,
  max(recorded_at) AS newest,
  dateDiff('second', max(recorded_at), now64(3)) AS lag_seconds,
  count() AS rows_24h
FROM ${DATABASE}.telemetry_snapshots
WHERE recorded_at >= now64(3) - INTERVAL 24 HOUR
UNION ALL
SELECT
  'telemetry_state_changes',
  max(changed_at),
  dateDiff('second', max(changed_at), now64(3)),
  count()
FROM ${DATABASE}.telemetry_state_changes
WHERE changed_at >= now64(3) - INTERVAL 24 HOUR
UNION ALL
SELECT
  'telemetry_hf_points',
  max(recorded_at),
  dateDiff('second', max(recorded_at), now64(3)),
  count()
FROM ${DATABASE}.telemetry_hf_points
WHERE recorded_at >= now64(3) - INTERVAL 24 HOUR
UNION ALL
SELECT
  'telemetry_waypoints',
  max(recorded_at),
  dateDiff('second', max(recorded_at), now64(3)),
  count()
FROM ${DATABASE}.telemetry_waypoints
WHERE recorded_at >= now64(3) - INTERVAL 24 HOUR
ORDER BY table
SQL

# P1: snapshot mirror stale > 10 minutes while we expect active polling
SNAPSHOT_LAG="$(ch_q --query "
  SELECT dateDiff('second', max(recorded_at), now64(3))
  FROM ${DATABASE}.telemetry_snapshots
" 2>/dev/null || echo "999999")"
if [[ "${SNAPSHOT_LAG}" =~ ^[0-9]+$ ]] && [[ "${SNAPSHOT_LAG}" -gt 600 ]]; then
  log "P1: telemetry_snapshots lag ${SNAPSHOT_LAG}s (>600s) — mirror may be stalled"
  P1_ISSUES=$((P1_ISSUES + 1))
fi

section "24h ingest rate by vehicle (top 10 snapshot producers)"
ch_q --format PrettyCompact <<SQL || true
SELECT
  vehicle_id,
  count() AS snapshots_24h,
  min(recorded_at) AS first_at,
  max(recorded_at) AS last_at
FROM ${DATABASE}.telemetry_snapshots
WHERE recorded_at >= now64(3) - INTERVAL 24 HOUR
GROUP BY vehicle_id
ORDER BY snapshots_24h DESC
LIMIT 10
SQL

section "Duplicate snapshot keys (vehicle_id + recorded_at) — last 7 days sample"
DUP_SNAPSHOTS="$(ch_q --query "
  SELECT count() FROM (
    SELECT vehicle_id, recorded_at, count() AS c
    FROM ${DATABASE}.telemetry_snapshots
    WHERE recorded_at >= now64(3) - INTERVAL 7 DAY
    GROUP BY vehicle_id, recorded_at
    HAVING c > 1
    LIMIT 1000
  )
" 2>/dev/null || echo "0")"
echo "duplicate_snapshot_keys_sample=${DUP_SNAPSHOTS}"
if [[ "${DUP_SNAPSHOTS}" =~ ^[0-9]+$ ]] && [[ "${DUP_SNAPSHOTS}" -gt 0 ]]; then
  log "P2: found ${DUP_SNAPSHOTS} duplicate (vehicle_id, recorded_at) groups in 7d sample"
  ch_q --format PrettyCompact <<SQL || true
SELECT vehicle_id, recorded_at, count() AS copies
FROM ${DATABASE}.telemetry_snapshots
WHERE recorded_at >= now64(3) - INTERVAL 7 DAY
GROUP BY vehicle_id, recorded_at
HAVING copies > 1
ORDER BY copies DESC
LIMIT 10
SQL
fi

section "Duplicate state-change keys — last 7 days sample"
ch_q --format PrettyCompact <<SQL || true
SELECT vehicle_id, signal_name, changed_at, count() AS copies
FROM ${DATABASE}.telemetry_state_changes
WHERE changed_at >= now64(3) - INTERVAL 7 DAY
GROUP BY vehicle_id, signal_name, changed_at
HAVING copies > 1
ORDER BY copies DESC
LIMIT 10
SQL

section "HF mirror trip coverage (last 7 days)"
ch_q --format PrettyCompact <<SQL || true
SELECT
  count(DISTINCT trip_id) AS trips_with_hf_points,
  count() AS hf_point_rows
FROM ${DATABASE}.telemetry_hf_points
WHERE recorded_at >= now64(3) - INTERVAL 7 DAY
SQL

section "Waypoint mirror trip coverage (last 7 days)"
ch_q --format PrettyCompact <<SQL || true
SELECT
  count(DISTINCT trip_id) AS trips_with_waypoints,
  count() AS waypoint_rows
FROM ${DATABASE}.telemetry_waypoints
WHERE recorded_at >= now64(3) - INTERVAL 7 DAY
SQL

section "PostgreSQL cross-check (optional — requires DATABASE_URL)"
if [[ -n "${PG_URL}" ]] && command -v psql >/dev/null 2>&1; then
  log "Comparing dimo_poll_log SUCCESS (24h) vs CH snapshot count (24h)"
  PG_POLLS="$(psql "${PG_URL}" -tAc "
    SELECT count(*) FROM dimo_poll_log
    WHERE status = 'SUCCESS'
      AND job_type = 'SNAPSHOT'
      AND started_at >= now() - interval '24 hours'
  " 2>/dev/null || echo "N/A")"
  CH_SNAPS="$(ch_q --query "
    SELECT count() FROM ${DATABASE}.telemetry_snapshots
    WHERE recorded_at >= now64(3) - INTERVAL 24 HOUR
  " 2>/dev/null || echo "N/A")"
  echo "pg_successful_snapshot_polls_24h=${PG_POLLS}"
  echo "ch_snapshot_rows_24h=${CH_SNAPS}"
  if [[ "${PG_POLLS}" =~ ^[0-9]+$ ]] && [[ "${CH_SNAPS}" =~ ^[0-9]+$ ]]; then
    # Rough ratio — CH rows can differ (stale skips, duplicates, multi-vehicle)
    RATIO_PCT=$(( CH_SNAPS * 100 / (PG_POLLS + 1) ))
    echo "ch_rows_per_pg_poll_pct_approx=${RATIO_PCT}%"
    if [[ "${RATIO_PCT}" -lt 50 ]]; then
      log "P1: CH snapshot rows << PG poll count — possible mirror loss"
      P1_ISSUES=$((P1_ISSUES + 1))
    fi
  fi
else
  log "DATABASE_URL unset or psql missing — skipping PG cross-check"
fi

section "Backend mirror flags (from backend.env if present)"
ENV_FILE="${BACKEND_ENV_FILE:-/opt/synqdrive/shared/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  grep -E '^(CLICKHOUSE_URL|HF_MIRROR_ENABLED|WAYPOINT_MIRROR_ENABLED|ACTIVITY_WINDOW_MIRROR_ENABLED|CLICKHOUSE_TRIP_ASSIST_ENABLED)=' "${ENV_FILE}" \
    | sed 's/CLICKHOUSE_URL=.*/CLICKHOUSE_URL=[REDACTED]/' || true
else
  log "backend.env not found at ${ENV_FILE}"
fi

section "Prometheus scrape hint"
echo "curl -s -H \"Authorization: Bearer \$METRICS_BEARER_TOKEN\" http://127.0.0.1:3000/metrics | grep synqdrive_clickhouse"

section "Summary"
if [[ "${P1_ISSUES}" -gt 0 ]]; then
  log "P1 issues detected: ${P1_ISSUES}"
  exit 1
fi
log "Pipeline audit complete — no P1 thresholds breached"
exit 0
