#!/usr/bin/env bash
# Install or refresh redis_exporter on the production VPS (Docker).
#
# Reads REDIS_* from backend.env; exposes metrics on 127.0.0.1:9121
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-redis-exporter.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
EXPORTERS_ENV="${EXPORTERS_ENV:-/opt/synqdrive/shared/exporters/exporters.env}"
REDIS_IMAGE="${REDIS_EXPORTER_IMAGE:-oliver006/redis_exporter:v1.62.0}"
CONTAINER="${CONTAINER:-synqdrive-redis-exporter}"
LISTEN_PORT="${REDIS_EXPORTER_PORT:-9121}"

REDIS_ADDR="${REDIS_ADDR:-127.0.0.1:6379}"
REDIS_PASSWORD=""

if [[ -f "$EXPORTERS_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$EXPORTERS_ENV"
fi

if [[ -f "$BACKEND_ENV" ]]; then
  REDIS_HOST="$(grep '^REDIS_HOST=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  REDIS_PORT="$(grep '^REDIS_PORT=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  REDIS_PASSWORD="$(grep '^REDIS_PASSWORD=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [[ -n "$REDIS_HOST" ]]; then
    REDIS_ADDR="${REDIS_HOST}:${REDIS_PORT:-6379}"
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

ENV_ARGS=()
if [[ -n "$REDIS_PASSWORD" ]]; then
  ENV_ARGS+=(-e "REDIS_PASSWORD=${REDIS_PASSWORD}")
fi

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  "${ENV_ARGS[@]}" \
  "$REDIS_IMAGE" \
  --redis.addr="$REDIS_ADDR" \
  --web.listen-address=127.0.0.1:"$LISTEN_PORT"

echo "redis_exporter started: $CONTAINER (127.0.0.1:${LISTEN_PORT} → ${REDIS_ADDR})"

sleep 3
if curl -sf "http://127.0.0.1:${LISTEN_PORT}/metrics" | grep -q 'redis_up'; then
  echo "redis_exporter health: OK"
else
  echo "WARN: redis_exporter metrics check failed" >&2
  docker logs "$CONTAINER" --tail 20 2>&1 || true
  exit 1
fi
