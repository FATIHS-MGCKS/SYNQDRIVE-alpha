#!/usr/bin/env bash
# Install or refresh postgres_exporter on the production VPS (Docker).
#
# Reads DATABASE_URL from backend.env and exposes metrics on 127.0.0.1:9187
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-postgres-exporter.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
EXPORTERS_ENV="${EXPORTERS_ENV:-/opt/synqdrive/shared/exporters/exporters.env}"
PG_IMAGE="${PG_EXPORTER_IMAGE:-quay.io/prometheuscommunity/postgres-exporter:v0.15.1}"
CONTAINER="${CONTAINER:-synqdrive-postgres-exporter}"
LISTEN_PORT="${POSTGRES_EXPORTER_PORT:-9187}"

if [[ -f "$EXPORTERS_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$EXPORTERS_ENV"
fi

if [[ -z "${DATA_SOURCE_NAME:-}" ]]; then
  if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "ERROR: $BACKEND_ENV not found and DATA_SOURCE_NAME unset" >&2
    exit 1
  fi
  DATABASE_URL="$(grep '^DATABASE_URL=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [[ -z "$DATABASE_URL" ]]; then
    echo "ERROR: DATABASE_URL missing in $BACKEND_ENV" >&2
    exit 1
  fi
  # postgres_exporter DSN: strip Prisma ?schema= query param; force sslmode for local VPS
  DATA_SOURCE_NAME="$(echo "$DATABASE_URL" | sed -E 's/\?schema=[^&]*(&|$)/?/; s/\?$//; s/$/?sslmode=disable/')"
  if [[ "$DATA_SOURCE_NAME" != postgresql://* && "$DATA_SOURCE_NAME" != postgres://* ]]; then
    echo "ERROR: unsupported DATABASE_URL format for postgres_exporter" >&2
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -e "DATA_SOURCE_NAME=${DATA_SOURCE_NAME}" \
  "$PG_IMAGE" \
  --web.listen-address=127.0.0.1:"$LISTEN_PORT"

echo "postgres_exporter started: $CONTAINER (127.0.0.1:${LISTEN_PORT})"

sleep 3
if curl -sf "http://127.0.0.1:${LISTEN_PORT}/metrics" | grep -q 'pg_up'; then
  echo "postgres_exporter health: OK"
else
  echo "WARN: postgres_exporter metrics check failed — verify DATABASE_URL / pg_hba.conf" >&2
  docker logs "$CONTAINER" --tail 20 2>&1 || true
  exit 1
fi
