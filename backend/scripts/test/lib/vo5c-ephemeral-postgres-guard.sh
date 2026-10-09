#!/usr/bin/env bash
# Fail-closed guard for VO5C disposable PostgreSQL migration tests.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

vo5c_ephemeral_guard_abort() {
  printf '[vo5c-ephemeral-postgres-guard] ABORT: %s\n' "$*" >&2
  exit 1
}

vo5c_ephemeral_assert_test_mode() {
  if [[ "${VO5C_EPHEMERAL_MIGRATION_TEST:-}" != "1" ]]; then
    vo5c_ephemeral_guard_abort "VO5C_EPHEMERAL_MIGRATION_TEST=1 required"
  fi
}

vo5c_ephemeral_parse_host_port_db() {
  local url=$1
  local base="${url%%\?*}"
  local rest="${base#postgresql://}"
  local userpass="${rest%%@*}"
  local hostdb="${rest#*@}"
  local hostport="${hostdb%%/*}"
  local dbname="${hostdb#*/}"
  VO5C_EPHEMERAL_USER="${userpass%%:*}"
  VO5C_EPHEMERAL_HOST="${hostport%%:*}"
  VO5C_EPHEMERAL_PORT="${hostport#*:}"
  VO5C_EPHEMERAL_DB="${dbname}"
}

vo5c_ephemeral_assert_isolated_target() {
  local database_url=$1
  local database_name=$2

  vo5c_ephemeral_assert_test_mode
  vo5c_ephemeral_parse_host_port_db "$database_url"

  if [[ ! "$database_name" =~ ^vo5c_r2_ ]]; then
    vo5c_ephemeral_guard_abort "database name must match vo5c_r2_* (got ${database_name})"
  fi

  local host_lower="${VO5C_EPHEMERAL_HOST,,}"
  case "$host_lower" in
    *synqdrive* | *hstgr* | *srv1374778* | *production* | *prod* )
      vo5c_ephemeral_guard_abort "refusing non-disposable database host (${VO5C_EPHEMERAL_HOST})"
      ;;
  esac

  if [[ "${VO5C_EPHEMERAL_PORT}" != "5432" && "${VO5C_EPHEMERAL_ALLOW_NONLOCAL_PORT:-}" != "1" ]]; then
    vo5c_ephemeral_guard_abort "refusing unexpected database port (${VO5C_EPHEMERAL_PORT})"
  fi

  if [[ "${VO5C_EPHEMERAL_HOST}" != "127.0.0.1" && "${VO5C_EPHEMERAL_HOST}" != "localhost" ]]; then
    vo5c_ephemeral_guard_abort "refusing non-local database host (${VO5C_EPHEMERAL_HOST})"
  fi

  if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"srv1374778"* ]]; then
    vo5c_ephemeral_guard_abort "DATABASE_URL appears production-like"
  fi
}
