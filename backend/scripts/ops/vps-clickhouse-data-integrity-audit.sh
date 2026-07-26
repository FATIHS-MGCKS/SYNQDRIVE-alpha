#!/usr/bin/env bash
#
# vps-clickhouse-data-integrity-audit.sh — Read-only data integrity audit for synqdrive.*
#
# Phase 2D.3: Checks parts health, detached parts, schema drift, TTL, partitions,
# merge backlog, and per-table size/row metrics.
#
# Usage (on VPS):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-data-integrity-audit.sh
#   bash .../vps-clickhouse-data-integrity-audit.sh --markdown > report.md
#
# Exit codes:
#   0 — no P0 integrity failures
#   1 — one or more P0 failures detected
#   2 — prerequisite error (client / connectivity)
#
set -euo pipefail

DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CH_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_USER="${CLICKHOUSE_USER:-synqdrive}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
OUTPUT_MD=0
FAILURES=0
WARNINGS=0

PRODUCTIVE_TABLES=(
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
p0_fail() { log "P0 FAIL: $*"; FAILURES=$((FAILURES + 1)); }
warn() { log "WARN: $*"; WARNINGS=$((WARNINGS + 1)); }
pass() { log "OK: $*"; }

usage() {
  cat <<'EOF'
Usage: vps-clickhouse-data-integrity-audit.sh [--markdown]

Environment:
  CLICKHOUSE_DATABASE  (default: synqdrive)
  CLICKHOUSE_HOST      (default: 127.0.0.1)
  CLICKHOUSE_PORT      (default: 9000)
  CLICKHOUSE_USER / CLICKHOUSE_PASSWORD
  Sources /opt/synqdrive/shared/clickhouse-backup.env when present
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --markdown) OUTPUT_MD=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

# shellcheck source=lib/clickhouse-query-lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/clickhouse-query-lib.sh"

ch_query_require_connection

section() {
  if [[ "$OUTPUT_MD" -eq 1 ]]; then
    echo ""
    echo "## $*"
    echo ""
  else
    echo ""
    echo "================================================================================"
    echo "== $*"
    echo "================================================================================"
  fi
}

md_table_header() {
  if [[ "$OUTPUT_MD" -eq 1 ]]; then
    echo "| Table | Engine | Rows | On disk | Oldest | Newest | Status |"
    echo "|-------|--------|------|---------|--------|--------|--------|"
  fi
}

section "ClickHouse data integrity audit — database=${DATABASE}"
log "version=$(ch_q --query "SELECT version()")"

section "Schema migrations"
ch_q --format PrettyCompact <<SQL || warn "schema_migrations query failed"
SELECT version, applied_at
FROM ${DATABASE}.schema_migrations
ORDER BY version
SQL

section "Unexpected tables in database"
unexpected="$(ch_q --query "
  SELECT name FROM system.tables
  WHERE database = '${DATABASE}'
    AND name NOT IN (
      'telemetry_snapshots','telemetry_state_changes','telemetry_waypoints',
      'trip_activity_windows','trip_segment_candidates',
      'telemetry_hf_points','telemetry_hf_windows','telemetry_hf_events',
      'schema_migrations'
    )
  ORDER BY name
" 2>/dev/null || true)"
if [[ -n "$unexpected" ]]; then
  warn "extra tables present: $(echo "$unexpected" | tr '\n' ' ')"
else
  pass "no unexpected tables"
fi

section "Detached parts (orphaned on disk)"
detached_count="$(ch_q --query "SELECT count() FROM system.detached_parts WHERE database='${DATABASE}'" 2>/dev/null || echo 0)"
log "detached_parts_count=${detached_count}"
if [[ "${detached_count}" -gt 0 ]]; then
  ch_q --format PrettyCompact <<SQL || true
SELECT database, table, partition_id, name, reason, bytes_on_disk, disk
FROM system.detached_parts
WHERE database = '${DATABASE}'
ORDER BY bytes_on_disk DESC
LIMIT 20
SQL
  # A part detached because ClickHouse could not load it is real data loss;
  # anything else detached is an operator action awaiting ATTACH/DROP.
  corrupt="$(ch_q --query "
    SELECT count() FROM system.detached_parts
    WHERE database='${DATABASE}'
      AND (reason LIKE 'broken%' OR reason LIKE 'unexpected%')
  " 2>/dev/null || echo 0)"
  if [[ "${corrupt}" -gt 0 ]]; then
    p0_fail "${corrupt} detached part(s) are broken/unexpected — data loss on those ranges"
  else
    warn "detached parts exist — review before ATTACH/DROP"
  fi
fi

section "Stale inactive parts"
# Inactive parts are the normal result of a merge or mutation; ClickHouse drops
# them after old_parts_lifetime. Only parts that outlive that window by a wide
# margin indicate a stuck cleanup thread, so age is the signal, not the count.
inactive_total="$(ch_q --query "
  SELECT count() FROM system.parts
  WHERE database='${DATABASE}' AND NOT active
" 2>/dev/null || echo 0)"
inactive_stale="$(ch_q --query "
  SELECT count() FROM system.parts
  WHERE database='${DATABASE}' AND NOT active
    AND modification_time < now() - INTERVAL 24 HOUR
" 2>/dev/null || echo 0)"
log "inactive_parts=${inactive_total} stale_over_24h=${inactive_stale}"
if [[ "${inactive_stale}" -gt 0 ]]; then
  warn "${inactive_stale} inactive part(s) older than 24h — part cleanup may be stuck"
  ch_q --format PrettyCompact <<SQL || true
SELECT database, table, partition, name, modification_time, bytes_on_disk
FROM system.parts
WHERE database='${DATABASE}' AND NOT active
  AND modification_time < now() - INTERVAL 24 HOUR
ORDER BY modification_time
LIMIT 50
SQL
else
  pass "no stale inactive parts"
fi

section "Pending mutations (TTL / ALTER)"
mutations="$(ch_q --query "
  SELECT count() FROM system.mutations
  WHERE database='${DATABASE}' AND is_done = 0
" 2>/dev/null || echo 0)"
log "pending_mutations=${mutations}"
if [[ "${mutations}" -gt 0 ]]; then
  warn "pending mutations — TTL or schema changes in flight"
  ch_q --format PrettyCompact <<SQL || true
SELECT table, mutation_id, command, create_time, parts_to_do, is_done, latest_fail_reason
FROM system.mutations
WHERE database='${DATABASE}' AND is_done = 0
ORDER BY create_time
SQL
fi

section "Partition fragmentation (parts per partition > 50)"
frag="$(ch_q --query "
  SELECT count() FROM (
    SELECT table, partition, count() AS c
    FROM system.parts
    WHERE database='${DATABASE}' AND active
    GROUP BY table, partition
    HAVING c > 50
  )
" 2>/dev/null || echo 0)"
if [[ "${frag}" -gt 0 ]]; then
  warn "high part count partitions=${frag}"
  ch_q --format PrettyCompact <<SQL || true
SELECT table, partition, count() AS parts, formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database='${DATABASE}' AND active
GROUP BY table, partition
HAVING parts > 50
ORDER BY parts DESC
LIMIT 20
SQL
else
  pass "no extreme partition fragmentation"
fi

section "TTL drift (rows older than expected retention + 7 day grace)"
# Grace window: TTL deletes during merges, not instantly
# The UNION branches are wrapped so ORDER BY can reference the result column
# names; the analyzer does not expose the first branch's aliases to an ORDER BY
# applied directly to a UNION.
ch_q --format PrettyCompact <<'SQL' || warn "TTL drift query failed"
SELECT * FROM (
SELECT 'telemetry_snapshots' AS table,
       count() AS rows_beyond_ttl
FROM synqdrive.telemetry_snapshots
WHERE recorded_at < now() - INTERVAL 187 DAY
UNION ALL
SELECT 'telemetry_state_changes', count()
FROM synqdrive.telemetry_state_changes
WHERE changed_at < now() - INTERVAL 372 DAY
UNION ALL
SELECT 'telemetry_waypoints', count()
FROM synqdrive.telemetry_waypoints
WHERE recorded_at < now() - INTERVAL 372 DAY
UNION ALL
SELECT 'trip_activity_windows', count()
FROM synqdrive.trip_activity_windows
WHERE window_start < now() - INTERVAL 372 DAY
UNION ALL
SELECT 'trip_segment_candidates', count()
FROM synqdrive.trip_segment_candidates
WHERE segment_start < now() - INTERVAL 187 DAY
UNION ALL
SELECT 'telemetry_hf_points', count()
FROM synqdrive.telemetry_hf_points
WHERE recorded_at < now() - INTERVAL 97 DAY
UNION ALL
SELECT 'telemetry_hf_windows', count()
FROM synqdrive.telemetry_hf_windows
WHERE window_start < now() - INTERVAL 187 DAY
UNION ALL
SELECT 'telemetry_hf_events', count()
FROM synqdrive.telemetry_hf_events
WHERE event_start < now() - INTERVAL 372 DAY
)
ORDER BY rows_beyond_ttl DESC
SQL

section "Per-table inventory"
md_table_header
for tbl in "${PRODUCTIVE_TABLES[@]}"; do
  exists="$(ch_q --query "SELECT count() FROM system.tables WHERE database='${DATABASE}' AND name='${tbl}'" 2>/dev/null || echo 0)"
  if [[ "$exists" != "1" ]]; then
    p0_fail "missing table ${DATABASE}.${tbl}"
    continue
  fi

  meta="$(ch_q --query "
    SELECT
      engine,
      toString(total_rows),
      formatReadableSize(total_bytes),
      ifNull(toString((SELECT min(min_time) FROM system.parts WHERE database='${DATABASE}' AND table='${tbl}' AND active)), 'n/a'),
      ifNull(toString((SELECT max(max_time) FROM system.parts WHERE database='${DATABASE}' AND table='${tbl}' AND active)), 'n/a')
    FROM system.tables
    WHERE database='${DATABASE}' AND name='${tbl}'
  " 2>/dev/null || echo "unknown	0	0	n/a	n/a")"
  engine="$(echo "$meta" | awk -F'\t' '{print $1}')"
  rows="$(echo "$meta" | awk -F'\t' '{print $2}')"
  size="$(echo "$meta" | awk -F'\t' '{print $3}')"
  oldest="$(echo "$meta" | awk -F'\t' '{print $4}')"
  newest="$(echo "$meta" | awk -F'\t' '{print $5}')"

  check_status="skipped"
  if ch_q --query "CHECK TABLE ${DATABASE}.${tbl}" >/tmp/ch_check_${tbl}.txt 2>&1; then
    if grep -qiE 'ok|success' /tmp/ch_check_${tbl}.txt 2>/dev/null || [[ ! -s /tmp/ch_check_${tbl}.txt ]]; then
      check_status="CHECK_OK"
      pass "${tbl}: CHECK TABLE ok (rows=${rows}, size=${size})"
    else
      check_status="CHECK_REVIEW"
      warn "${tbl}: CHECK TABLE output needs review"
      cat /tmp/ch_check_${tbl}.txt || true
    fi
  else
    check_status="CHECK_FAILED"
    p0_fail "${tbl}: CHECK TABLE failed"
    cat /tmp/ch_check_${tbl}.txt 2>/dev/null || true
  fi
  rm -f /tmp/ch_check_${tbl}.txt

  if [[ "$OUTPUT_MD" -eq 1 ]]; then
    echo "| ${tbl} | ${engine} | ${rows} | ${size} | ${oldest} | ${newest} | ${check_status} |"
  else
    log "table=${tbl} engine=${engine} rows=${rows} size=${size} oldest=${oldest} newest=${newest} check=${check_status}"
    ch_q --query "SELECT engine_full FROM system.tables WHERE database='${DATABASE}' AND name='${tbl}'" 2>/dev/null | sed 's/^/  engine_full: /' || true
  fi
done

section "Engine / ORDER BY drift vs expected"
ch_q --format PrettyCompact <<SQL || warn "engine drift query failed"
SELECT
  name AS table,
  engine,
  partition_key,
  sorting_key,
  extract(engine_full, 'TTL [^)]*') AS ttl_clause
FROM system.tables
WHERE database = '${DATABASE}'
  AND name IN (
    'telemetry_snapshots','telemetry_state_changes','telemetry_waypoints',
    'trip_activity_windows','trip_segment_candidates',
    'telemetry_hf_points','telemetry_hf_windows','telemetry_hf_events'
  )
ORDER BY name
SQL

section "ReplacingMergeTree duplicate pressure (unmerged rows estimate)"
for tbl in trip_activity_windows trip_segment_candidates telemetry_hf_windows telemetry_hf_events; do
  if ch_q --query "SELECT count() FROM system.tables WHERE database='${DATABASE}' AND name='${tbl}'" 2>/dev/null | grep -q '^1$'; then
    dup_est="$(ch_q --query "
      SELECT
        (SELECT count() FROM ${DATABASE}.${tbl}) -
        (SELECT count() FROM ${DATABASE}.${tbl} FINAL)
    " 2>/dev/null || echo na)"
    log "${tbl} unmerged_duplicate_estimate=${dup_est}"
    if [[ "$dup_est" != "na" && "$dup_est" -gt 10000 ]]; then
      warn "${tbl}: high unmerged duplicate estimate (${dup_est}) — schedule OPTIMIZE if queries use FINAL"
    fi
  fi
done

section "Summary"
log "p0_failures=${FAILURES} warnings=${WARNINGS}"
if [[ "$FAILURES" -gt 0 ]]; then
  log "RESULT: FAIL — see P0 items above"
  exit 1
fi
log "RESULT: PASS — no P0 integrity failures (review warnings)"
exit 0
