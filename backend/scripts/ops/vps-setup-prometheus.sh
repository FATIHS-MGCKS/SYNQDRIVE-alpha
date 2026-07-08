#!/usr/bin/env bash
# Install or refresh SynqDrive Prometheus on the production VPS (Docker).
#
# Prerequisites on VPS:
#   - Docker
#   - METRICS_BEARER_TOKEN in /opt/synqdrive/shared/backend.env
#   - Backend listening on 127.0.0.1:3001 (PM2)
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-prometheus.sh
set -euo pipefail

SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
PROM_IMAGE="${PROM_IMAGE:-prom/prometheus:v2.54.1}"
CONTAINER="${CONTAINER:-synqdrive-prometheus}"
BACKEND_PORT="${BACKEND_PORT:-3001}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

TOKEN="$(grep '^METRICS_BEARER_TOKEN=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: METRICS_BEARER_TOKEN missing in $BACKEND_ENV" >&2
  exit 1
fi

SRC_PROM="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus"
if [[ ! -f "$SRC_PROM/prometheus.vps.yml" ]]; then
  echo "ERROR: $SRC_PROM/prometheus.vps.yml not found (deploy latest main first)" >&2
  exit 1
fi

mkdir -p "$PROM_DIR/secrets"
printf '%s' "$TOKEN" > "$PROM_DIR/secrets/metrics_bearer_token"
# Prometheus container runs as non-root (nobody) — readable only on localhost VPS.
chmod 644 "$PROM_DIR/secrets/metrics_bearer_token"

cp "$SRC_PROM/alerts.yml" "$PROM_DIR/alerts.yml"
cp "$SRC_PROM/prometheus.vps.yml" "$PROM_DIR/prometheus.yml"

# Allow custom backend port without editing the checked-in template.
if [[ "$BACKEND_PORT" != "3001" ]]; then
  sed -i "s/127.0.0.1:3001/127.0.0.1:${BACKEND_PORT}/" "$PROM_DIR/prometheus.yml"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

# Host network: scrape 127.0.0.1:3001 directly; UI on localhost:9090 only.
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -v "$PROM_DIR/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$PROM_DIR/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  -v "$PROM_DIR/secrets:/etc/prometheus/secrets:ro" \
  "$PROM_IMAGE" \
  --config.file=/etc/prometheus/prometheus.yml \
  --web.enable-lifecycle \
  --web.listen-address=127.0.0.1:9090

echo "Prometheus container started: $CONTAINER"
echo "Config: $PROM_DIR/prometheus.yml"
echo "UI (VPS localhost only): http://127.0.0.1:9090"

sleep 3

if curl -sf "http://127.0.0.1:9090/-/healthy" >/dev/null; then
  echo "Prometheus health: OK"
else
  echo "WARN: Prometheus /-/healthy check failed — inspect: docker logs $CONTAINER" >&2
  exit 1
fi

TARGET_UP="$(curl -sf 'http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22synqdrive-backend%22%7D' | grep -o '"value":\[[^]]*\]' | head -1 || true)"
if echo "$TARGET_UP" | grep -q '"1"'; then
  echo "Scrape target synqdrive-backend: UP"
else
  echo "WARN: synqdrive-backend target not UP yet — check bearer token and backend port $BACKEND_PORT" >&2
  docker logs "$CONTAINER" --tail 20 2>&1 || true
  exit 1
fi
