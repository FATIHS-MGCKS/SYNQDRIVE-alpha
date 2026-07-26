#!/usr/bin/env bash
#
# vps-clickhouse-compose-env.sh — Resolve COMPOSE_FILE for VPS ClickHouse ops.
#
# Sources shared override when present; falls back to release-relative compose.
#
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/synqdrive/current/backend}"
OVERRIDE="${BACKEND_DIR}/docker-compose.vps-clickhouse.yml"

if [[ -f "${OVERRIDE}" ]] && [[ -f "${BACKEND_DIR}/docker-compose.yml" ]]; then
  export COMPOSE_FILE="${BACKEND_DIR}/docker-compose.yml:${OVERRIDE}"
else
  export COMPOSE_FILE="${BACKEND_DIR}/docker-compose.yml"
fi

export BACKEND_DIR
