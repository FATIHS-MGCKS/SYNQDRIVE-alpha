#!/usr/bin/env bash
#
# vps-clickhouse-health-check.sh — Post-step health validation (Phase 2D.7).
#
# Checks: container health, CH SELECT 1, optional API readiness, mirror freshness.
#
set -euo pipefail

CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
HEALTH_URL="${CLICKHOUSE_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health/readiness}"
MAX_SNAPSHOT_LAG_SEC="${CLICKHOUSE_MAX_SNAPSHOT_LAG_SEC:-600}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
FAIL=0

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

ch_exec() {
  docker exec "$CONTAINER" clickhouse-client \
    --user "${CLICKHOUSE_USER:-synqdrive}" \
    ${CLICKHOUSE_PASSWORD:+--password "$CLICKHOUSE_PASSWORD"} "$@"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "FAIL: container ${CONTAINER} not running"
  exit 1
fi

health="$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' 2>/dev/null || echo unknown)"
if [[ "$health" != "healthy" && "$health" != "running" ]]; then
  log "FAIL: container health=${health}"
  FAIL=1
else
  log "OK: container health=${health}"
fi

if ch_exec --query "SELECT 1" >/dev/null 2>&1; then
  log "OK: ClickHouse SELECT 1"
else
  log "FAIL: ClickHouse SELECT 1"
  FAIL=1
fi

if command -v curl >/dev/null 2>&1; then
  if resp="$(curl -sf "$HEALTH_URL" 2>/dev/null)"; then
    if echo "$resp" | grep -q '"clickhouse"'; then
      log "OK: API readiness (${HEALTH_URL})"
    else
      log "WARN: readiness response missing clickhouse check"
    fi
  else
    log "WARN: API readiness unreachable (${HEALTH_URL})"
  fi
fi

SNAPSHOT_LAG="$(ch_exec --query "
  SELECT dateDiff('second', max(recorded_at), now64(3))
  FROM ${DATABASE}.telemetry_snapshots
" 2>/dev/null || echo "999999")"

if [[ "${SNAPSHOT_LAG}" =~ ^[0-9]+$ ]]; then
  log "INFO: telemetry_snapshots lag_seconds=${SNAPSHOT_LAG}"
  if [[ "${SNAPSHOT_LAG}" -gt "${MAX_SNAPSHOT_LAG_SEC}" ]]; then
    log "WARN: snapshot mirror lag > ${MAX_SNAPSHOT_LAG_SEC}s (may be expected during outage)"
  fi
fi

TABLE_COUNT="$(ch_exec --query "
  SELECT count() FROM system.tables WHERE database='${DATABASE}'
" 2>/dev/null || echo "0")"
log "INFO: synqdrive tables=${TABLE_COUNT}"

exit "$FAIL"
