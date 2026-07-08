#!/usr/bin/env bash
#
# clickhouse-ping-url.sh
#
# Verifies ClickHouse connectivity via CLICKHOUSE_URL (HTTP interface).
# Does NOT require Docker — works against local Docker, native, or external
# self-hosted ClickHouse as long as CLICKHOUSE_URL is reachable.
#
# Usage (from backend/):
#   ./scripts/clickhouse-ping-url.sh
#   npm run clickhouse:ping:url
#
# Environment (same as the NestJS backend):
#   CLICKHOUSE_URL        — required (e.g. http://localhost:8123)
#   CLICKHOUSE_USER       — optional (default: default)
#   CLICKHOUSE_PASSWORD   — optional
#   CLICKHOUSE_DATABASE   — optional (default: synqdrive)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

# Load backend/.env when present (local dev convenience; never required in CI).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CLICKHOUSE_URL="${CLICKHOUSE_URL:-}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"

if [[ -z "${CLICKHOUSE_URL}" ]]; then
  echo "!! CLICKHOUSE_URL is not set." >&2
  echo "   Set it in backend/.env or export it before running this script." >&2
  exit 1
fi

# Strip trailing slash for predictable URL joining.
CLICKHOUSE_URL="${CLICKHOUSE_URL%/}"

echo "==> ClickHouse URL ping"
echo "    URL      : ${CLICKHOUSE_URL}"
echo "    Database : ${CLICKHOUSE_DATABASE}"
echo "    User     : ${CLICKHOUSE_USER}"

if ! command -v curl >/dev/null 2>&1; then
  echo "!! curl is required for clickhouse:ping:url" >&2
  exit 1
fi

# HTTP health endpoint (no auth on most setups; harmless probe).
HTTP_PING="$(curl -fsS --max-time 10 "${CLICKHOUSE_URL}/ping" 2>/dev/null || true)"
if [[ "${HTTP_PING}" == "Ok." ]]; then
  echo "    /ping    : Ok."
else
  echo "    /ping    : unexpected response (${HTTP_PING:-empty/failed})" >&2
  exit 1
fi

# Authenticated query — mirrors backend @clickhouse/client usage.
AUTH_ARGS=()
if [[ -n "${CLICKHOUSE_PASSWORD}" ]]; then
  AUTH_ARGS=(--user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}")
elif [[ -n "${CLICKHOUSE_USER}" && "${CLICKHOUSE_USER}" != "default" ]]; then
  AUTH_ARGS=(--user "${CLICKHOUSE_USER}")
fi

QUERY_URL="${CLICKHOUSE_URL}/?database=${CLICKHOUSE_DATABASE}"
RESULT="$(curl -fsS --max-time 15 "${AUTH_ARGS[@]}" \
  --data-binary "SELECT 1 AS ok FORMAT TabSeparated" \
  "${QUERY_URL}" 2>/dev/null || true)"

if [[ "${RESULT}" == "1" ]]; then
  echo "    SELECT 1 : ok (database=${CLICKHOUSE_DATABASE})"
  echo "==> ClickHouse is reachable via CLICKHOUSE_URL."
  exit 0
fi

echo "!! SELECT 1 failed (got: ${RESULT:-empty/error})" >&2
echo "   Check CLICKHOUSE_URL, credentials, and that the database exists." >&2
exit 1
