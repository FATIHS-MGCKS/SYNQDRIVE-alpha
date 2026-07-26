#!/usr/bin/env bash
#
# clickhouse-query-lib.sh — shared clickhouse-client invocation for audit scripts.
#
# The production VPS runs ClickHouse only as a container and has no host
# clickhouse-client, so audits that shell out to the binary directly report a
# false "connectivity" failure. Prefer the host binary when present, otherwise
# run the client inside the container.
#
# Expects CH_HOST / CH_PORT / CH_USER / CH_PASSWORD / DATABASE to be set by the
# caller. Honours CLICKHOUSE_CONTAINER (default synqdrive-clickhouse).

CH_QUERY_CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
CH_QUERY_MODE=""

ch_query_resolve_mode() {
  if [[ -n "$CH_QUERY_MODE" ]]; then
    return 0
  fi
  if command -v clickhouse-client >/dev/null 2>&1; then
    CH_QUERY_MODE="host"
  elif command -v docker >/dev/null 2>&1 &&
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CH_QUERY_CONTAINER"; then
    CH_QUERY_MODE="container"
  else
    CH_QUERY_MODE="none"
  fi
}

# Query ClickHouse. Extra args are passed through; stdin is forwarded so callers
# can keep using heredocs for SQL.
ch_q() {
  ch_query_resolve_mode
  case "$CH_QUERY_MODE" in
    host)
      clickhouse-client \
        --host "$CH_HOST" \
        --port "$CH_PORT" \
        --user "$CH_USER" \
        ${CH_PASSWORD:+--password "$CH_PASSWORD"} \
        ${DATABASE:+--database "$DATABASE"} \
        "$@"
      ;;
    container)
      # Inside the container ClickHouse is always local, so CH_HOST (which may
      # point at the host-published port) must not be forwarded.
      docker exec -i "$CH_QUERY_CONTAINER" clickhouse-client \
        --user "$CH_USER" \
        ${CH_PASSWORD:+--password "$CH_PASSWORD"} \
        ${DATABASE:+--database "$DATABASE"} \
        "$@"
      ;;
    *)
      echo "ERROR: no clickhouse-client on host and container ${CH_QUERY_CONTAINER} not running" >&2
      return 2
      ;;
  esac
}

# Fail fast with a message that distinguishes "no client" from "cannot connect".
ch_query_require_connection() {
  ch_query_resolve_mode
  if [[ "$CH_QUERY_MODE" == "none" ]]; then
    echo "ERROR: clickhouse-client not found on host and container ${CH_QUERY_CONTAINER} not running" >&2
    exit 2
  fi
  if ! ch_q --query "SELECT 1" >/dev/null 2>&1; then
    echo "ERROR: cannot connect to ClickHouse (mode=${CH_QUERY_MODE})" >&2
    exit 2
  fi
}
