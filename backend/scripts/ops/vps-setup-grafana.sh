#!/usr/bin/env bash
# Install or refresh SynqDrive Grafana on the production VPS (Docker).
#
# Prerequisites:
#   - Docker
#   - Prometheus running (vps-setup-prometheus.sh)
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
set -euo pipefail

SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
GRAFANA_DIR="${GRAFANA_DIR:-/opt/synqdrive/shared/grafana}"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-grafana/grafana:11.2.0}"
CONTAINER="${CONTAINER:-synqdrive-grafana}"
ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  echo "Generated Grafana admin password (save securely): $ADMIN_PASSWORD"
fi

SRC="${SYNQDRIVE_ROOT}/backend/monitoring/grafana"
if [[ ! -d "$SRC/provisioning" ]]; then
  echo "ERROR: $SRC/provisioning not found — deploy latest main first" >&2
  exit 1
fi

mkdir -p "$GRAFANA_DIR/provisioning/datasources" "$GRAFANA_DIR/provisioning/dashboards" "$GRAFANA_DIR/dashboards"
cp -r "$SRC/provisioning/"* "$GRAFANA_DIR/provisioning/"
cp "$SRC/dashboards/synqdrive-ops.json" "$GRAFANA_DIR/dashboards/"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -e GF_SECURITY_ADMIN_USER="$ADMIN_USER" \
  -e GF_SECURITY_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_SERVER_HTTP_ADDR=127.0.0.1 \
  -e GF_SERVER_HTTP_PORT=3000 \
  -v "$GRAFANA_DIR/provisioning/datasources:/etc/grafana/provisioning/datasources:ro" \
  -v "$GRAFANA_DIR/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro" \
  -v "$GRAFANA_DIR/dashboards:/etc/grafana/dashboards:ro" \
  "$GRAFANA_IMAGE"

echo "Grafana started: $CONTAINER"
echo "UI (VPS localhost): http://127.0.0.1:3000"
echo "Login: $ADMIN_USER / (password above or GRAFANA_ADMIN_PASSWORD env)"
echo "SSH tunnel: ssh -L 3000:127.0.0.1:3000 root@srv1374778.hstgr.cloud"

sleep 5
if curl -sf "http://127.0.0.1:3000/api/health" >/dev/null; then
  echo "Grafana health: OK"
else
  echo "WARN: Grafana health check failed — docker logs $CONTAINER" >&2
  exit 1
fi
