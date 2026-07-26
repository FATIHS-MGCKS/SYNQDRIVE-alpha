#!/usr/bin/env bash
# Install or refresh nginx-prometheus-exporter on the production VPS (Docker).
#
# Requires nginx stub_status on localhost — see nginx-stub-status.snippet
# Metrics on 127.0.0.1:9113
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-nginx-exporter.sh
set -euo pipefail

EXPORTERS_ENV="${EXPORTERS_ENV:-/opt/synqdrive/shared/exporters/exporters.env}"
NGINX_IMAGE="${NGINX_EXPORTER_IMAGE:-nginx/nginx-prometheus-exporter:1.3.0}"
CONTAINER="${CONTAINER:-synqdrive-nginx-exporter}"
LISTEN_PORT="${NGINX_EXPORTER_PORT:-9113}"
NGINX_SCRAPE_URI="${NGINX_SCRAPE_URI:-http://127.0.0.1:8081/nginx_status}"

if [[ -f "$EXPORTERS_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$EXPORTERS_ENV"
fi

if ! curl -sf "$NGINX_SCRAPE_URI" >/dev/null 2>&1; then
  echo "WARN: nginx stub_status not reachable at $NGINX_SCRAPE_URI" >&2
  echo "      Apply backend/scripts/ops/nginx-stub-status.snippet and reload nginx" >&2
  echo "      Continuing install — exporter will report scrape errors until stub_status is live"
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
  "$NGINX_IMAGE" \
  -nginx.scrape-uri="$NGINX_SCRAPE_URI" \
  -web.listen-address=127.0.0.1:"$LISTEN_PORT"

echo "nginx-prometheus-exporter started: $CONTAINER (127.0.0.1:${LISTEN_PORT})"

sleep 3
if curl -sf "http://127.0.0.1:${LISTEN_PORT}/metrics" | head -1 | grep -q '^#'; then
  echo "nginx_exporter health: OK"
else
  echo "WARN: nginx_exporter metrics endpoint check failed" >&2
  exit 1
fi
