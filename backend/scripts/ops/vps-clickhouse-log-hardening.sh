#!/usr/bin/env bash
# Apply ClickHouse log hardening on the VPS (config mounts + container recreate).
#
# Usage (on VPS, from linked release):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-log-hardening.sh
#
# Safe to re-run. Recreates only synqdrive-clickhouse; Postgres/Redis untouched.
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/synqdrive/current/backend}"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.yml"
CONTAINER_ID_FILE="/var/lib/docker/containers"
CLICKHOUSE_CONTAINER="synqdrive-clickhouse"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "!! docker-compose.yml not found at $COMPOSE_FILE" >&2
  exit 1
fi

echo "==> Disk before"
df -h / | tail -1

echo "==> Truncate oversized Docker json logs (ClickHouse)"
while IFS= read -r logfile; do
  size_mb="$(du -m "$logfile" 2>/dev/null | awk '{print $1}')"
  if [[ "${size_mb:-0}" -gt 512 ]]; then
    echo "    truncating ${logfile} (${size_mb}M)"
    truncate -s 0 "$logfile"
  fi
done < <(find "$CONTAINER_ID_FILE" -name '*-json.log' 2>/dev/null || true)

cd "$BACKEND_DIR"

echo "==> Recreate ClickHouse with hardened logging config"
docker compose up -d --force-recreate clickhouse

echo "==> Wait for ClickHouse health"
for _ in $(seq 1 30); do
  status="$(docker inspect "$CLICKHOUSE_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
docker inspect "$CLICKHOUSE_CONTAINER" --format 'Health={{.State.Health.Status}} LogConfig={{json .HostConfig.LogConfig}}'

echo "==> Drop bloated disabled system log tables (best-effort)"
docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client -q "
  DROP TABLE IF EXISTS system.text_log;
  DROP TABLE IF EXISTS system.trace_log;
  DROP TABLE IF EXISTS system.processors_profile_log;
  DROP TABLE IF EXISTS system.asynchronous_metric_log;
" 2>/dev/null || true

echo "==> Disk after"
df -h / | tail -1

echo "==> System log table sizes"
docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client -q "
  SELECT table, formatReadableSize(sum(bytes_on_disk)) AS size
  FROM system.parts
  WHERE active AND database = 'system' AND table LIKE '%_log'
  GROUP BY table
  ORDER BY sum(bytes_on_disk) DESC
" 2>/dev/null || true

echo "Done."
