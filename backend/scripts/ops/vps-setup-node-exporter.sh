#!/usr/bin/env bash
# Install or refresh SynqDrive node_exporter on the production VPS (Docker).
#
# Exposes host CPU/RAM/disk metrics on 127.0.0.1:9100 and textfile backup gauge.
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-node-exporter.sh
set -euo pipefail

NODE_IMAGE="${NODE_IMAGE:-prom/node-exporter:v1.8.2}"
CONTAINER="${CONTAINER:-synqdrive-node-exporter}"
TEXTFILE_DIR="${TEXTFILE_DIR:-/opt/synqdrive/shared/node-exporter-textfile}"

mkdir -p "$TEXTFILE_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  --pid host \
  -v /:/host:ro,rslave \
  -v "$TEXTFILE_DIR:/textfile:ro" \
  "$NODE_IMAGE" \
  --path.rootfs=/host \
  --web.listen-address=127.0.0.1:9100 \
  --collector.textfile.directory=/textfile

echo "node_exporter started: $CONTAINER (127.0.0.1:9100)"
echo "Textfile dir: $TEXTFILE_DIR"

sleep 2
if curl -sf "http://127.0.0.1:9100/metrics" | head -1 | grep -q '^#'; then
  echo "node_exporter health: OK"
else
  echo "WARN: node_exporter metrics check failed" >&2
  exit 1
fi
