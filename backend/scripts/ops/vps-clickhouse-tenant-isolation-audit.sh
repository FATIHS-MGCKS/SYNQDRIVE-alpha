#!/usr/bin/env bash
#
# vps-clickhouse-tenant-isolation-audit.sh — Read-only tenant isolation audit.
#
# Phase 2D.4: org_id presence, empty org rows, ORDER BY tenant-leading check,
# materialized views, cross-table org distribution.
#
set -euo pipefail

DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CH_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_USER="${CLICKHOUSE_USER:-synqdrive}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"

TABLES=(
  telemetry_snapshots
  telemetry_state_changes
  telemetry_waypoints
  trip_activity_windows
  trip_segment_candidates
  telemetry_hf_points
  telemetry_hf_windows
  telemetry_hf_events
)

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { log "WARN: $*"; }

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

ch_q() {
  clickhouse-client \
    --host "$CH_HOST" --port "$CH_PORT" \
    --user "$CH_USER" ${CH_PASSWORD:+--password "$CH_PASSWORD"} \
    --database "$DATABASE" "$@"
}

if ! ch_q --query "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: cannot connect to ClickHouse" >&2
  exit 2
fi

log "ClickHouse tenant isolation audit database=${DATABASE}"

echo ""
log "=== Schema: org_id column presence ==="
ch_q --format PrettyCompact <<SQL
SELECT
  name AS table,
  hasColumn('${DATABASE}', name, 'org_id') AS has_org_id,
  engine,
  sorting_key,
  partition_key
FROM system.tables
WHERE database = '${DATABASE}'
  AND name IN ($(printf "'%s'," "${TABLES[@]}" | sed 's/,$//'))
ORDER BY name
SQL

echo ""
log "=== ORDER BY tenant-leading (org_id first) ==="
ch_q --query "
  SELECT name, sorting_key,
    if(startsWith(sorting_key, 'org_id'), 'yes', 'no') AS org_leading
  FROM system.tables
  WHERE database = '${DATABASE}'
    AND name IN ($(printf "'%s'," "${TABLES[@]}" | sed 's/,$//'))
  ORDER BY name
" --format PrettyCompact

echo ""
log "=== Materialized views ==="
mv_count="$(ch_q --query "
  SELECT count() FROM system.tables
  WHERE database = '${DATABASE}' AND engine LIKE '%MaterializedView%'
" 2>/dev/null || echo 0)"
log "materialized_views_in_${DATABASE}=${mv_count}"
if [[ "${mv_count}" -gt 0 ]]; then
  ch_q --query "SELECT name, engine FROM system.tables WHERE database='${DATABASE}' AND engine LIKE '%MaterializedView%'" --format PrettyCompact
fi

echo ""
log "=== Empty org_id row counts (tables with org_id column) ==="
for tbl in "${TABLES[@]}"; do
  has="$(ch_q --query "SELECT hasColumn('${DATABASE}', '${tbl}', 'org_id')" 2>/dev/null || echo 0)"
  if [[ "$has" == "1" ]]; then
    empty="$(ch_q --query "SELECT count() FROM ${DATABASE}.${tbl} WHERE org_id = ''" 2>/dev/null || echo na)"
    total="$(ch_q --query "SELECT count() FROM ${DATABASE}.${tbl}" 2>/dev/null || echo na)"
    log "table=${tbl} empty_org_id=${empty} total_rows=${total}"
    if [[ "$empty" != "na" && "$total" != "na" && "$total" -gt 0 ]]; then
      pct=$((empty * 100 / total))
      if [[ "$pct" -gt 50 ]]; then
        warn "${tbl}: ${pct}% rows have empty org_id — backfill needed"
      fi
    fi
  else
    log "table=${tbl} org_id_column=missing"
    warn "${tbl} has no org_id column"
  fi
done

echo ""
log "=== HF tables: distinct org_id count ==="
for tbl in telemetry_hf_points telemetry_hf_windows telemetry_hf_events; do
  ch_q --query "
    SELECT '${tbl}' AS table, uniqExact(org_id) AS distinct_orgs, count() AS rows
    FROM ${DATABASE}.${tbl}
  " 2>/dev/null || warn "query failed for ${tbl}"
done

echo ""
log "=== tenant_id column search (expect 0 tables) ==="
tenant_cols="$(ch_q --query "
  SELECT count() FROM system.columns
  WHERE database='${DATABASE}' AND name = 'tenant_id'
" 2>/dev/null || echo 0)"
log "tenant_id_columns=${tenant_cols}"

echo ""
log "Audit complete — review WARN lines and empty org_id counts"
