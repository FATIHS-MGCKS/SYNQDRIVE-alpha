#!/usr/bin/env bash
#
# vps-clickhouse-performance-audit.sh — Read-only ClickHouse performance snapshot.
#
# Phase 2D.5: CPU/RAM, merges, parts, compression, slow queries, partition health.
#
set -euo pipefail

DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CH_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_USER="${CLICKHOUSE_USER:-synqdrive}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

# shellcheck source=lib/clickhouse-query-lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/clickhouse-query-lib.sh"

ch_query_require_connection

section() {
  echo ""
  echo "================================================================================"
  echo "== $*"
  echo "================================================================================"
}

section "Host / container resources"
if command -v docker >/dev/null && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker stats "$CONTAINER" --no-stream 2>/dev/null || true
  docker inspect "$CONTAINER" --format 'MemoryLimit={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}' 2>/dev/null || true
else
  log "container ${CONTAINER} not running or docker unavailable"
fi
df -h / | tail -1

section "ClickHouse asynchronous metrics (CPU / memory)"
ch_q --format PrettyCompact <<'SQL' || true
SELECT metric, value
FROM system.asynchronous_metrics
WHERE metric IN (
  'OSUserTimeNormalized', 'OSSystemTimeNormalized', 'OSIdleTimeNormalized',
  'OSMemoryTotal', 'OSMemoryAvailable', 'OSMemoryFreeWithoutCached',
  'NumberOfTables', 'NumberOfDatabases', 'MaxPartCountForPartition',
  'TotalBytesOfMergeTreeTables', 'TotalRowsOfMergeTreeTables'
)
ORDER BY metric
SQL

section "Table size + compression ratio"
ch_q --format PrettyCompact <<SQL
SELECT
  table,
  sum(rows) AS rows,
  formatReadableSize(sum(data_compressed_bytes)) AS compressed,
  formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
  round(sum(data_compressed_bytes) / nullIf(sum(data_uncompressed_bytes), 0), 3) AS compression_ratio,
  formatReadableSize(sum(bytes_on_disk)) AS on_disk
FROM system.parts
WHERE database = '${DATABASE}' AND active
GROUP BY table
ORDER BY sum(bytes_on_disk) DESC
SQL

section "Partition fragmentation (parts per partition)"
ch_q --format PrettyCompact <<SQL
SELECT table, partition, count() AS parts,
       sum(rows) AS rows,
       formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database = '${DATABASE}' AND active
GROUP BY table, partition
HAVING parts > 20
ORDER BY parts DESC
LIMIT 25
SQL

section "Active merges"
ch_q --format PrettyCompact <<'SQL'
SELECT database, table, partition_id, num_parts, progress,
       formatReadableSize(total_size_bytes_compressed) AS size,
       elapsed, is_mutation
FROM system.merges
ORDER BY elapsed DESC
SQL

section "Merge / mutation backlog"
ch_q --format PrettyCompact <<'SQL'
SELECT
  (SELECT count() FROM system.merges) AS active_merges,
  (SELECT count() FROM system.mutations WHERE is_done = 0) AS pending_mutations
SQL

section "Background pool"
ch_q --format PrettyCompact <<'SQL'
SELECT type, status, count() AS cnt
FROM system.processes
WHERE is_cancelled = 0
GROUP BY type, status
ORDER BY cnt DESC
LIMIT 20
SQL

section "Slow queries (query_log, >1s, last 7d)"
ch_q --format PrettyCompact <<'SQL' 2>/dev/null || log "query_log unavailable or empty"
SELECT
  event_time,
  query_duration_ms,
  read_rows,
  read_bytes,
  formatReadableSize(memory_usage) AS memory,
  substring(query, 1, 120) AS query_preview
FROM system.query_log
WHERE type = 'QueryFinish'
  AND query_duration_ms >= 1000
  AND event_date >= today() - 7
  AND current_database = currentDatabase()
ORDER BY query_duration_ms DESC
LIMIT 20
SQL

section "Insert pressure (query_log, last 24h)"
ch_q --format PrettyCompact <<'SQL' 2>/dev/null || true
SELECT
  count() AS insert_queries,
  sum(written_rows) AS written_rows,
  formatReadableSize(sum(written_bytes)) AS written_bytes
FROM system.query_log
WHERE type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND event_date >= today() - 1
SQL

section "Storage disks / policies"
ch_q --format PrettyCompact <<'SQL'
SELECT name, path, formatReadableSize(free_space) AS free, formatReadableSize(total_space) AS total
FROM system.disks
SQL
ch_q --query "SELECT policy_name, volume_name, disks FROM system.storage_policies" --format PrettyCompact 2>/dev/null || true

section "Per-table index / sort key"
ch_q --format PrettyCompact <<SQL
SELECT name, engine, partition_key, sorting_key, primary_key
FROM system.tables
WHERE database = '${DATABASE}'
  AND engine LIKE '%MergeTree%'
ORDER BY name
SQL

log "Performance audit complete"
