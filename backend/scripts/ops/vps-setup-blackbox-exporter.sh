#!/usr/bin/env bash
# Install or refresh SynqDrive blackbox_exporter on the production VPS (Docker).
#
# Probes TLS certificate expiry for app.synqdrive.eu on 127.0.0.1:9115.
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-blackbox-exporter.sh
set -euo pipefail

SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BB_IMAGE="${BB_IMAGE:-prom/blackbox-exporter:v0.25.0}"
CONTAINER="${CONTAINER:-synqdrive-blackbox-exporter}"
BB_CONFIG="${BB_CONFIG:-/opt/synqdrive/shared/blackbox/blackbox.yml}"

SRC_BB="${SYNQDRIVE_ROOT}/backend/monitoring/blackbox/blackbox.yml"
if [[ ! -f "$SRC_BB" ]]; then
  echo "ERROR: $SRC_BB not found" >&2
  exit 1
fi

mkdir -p "$(dirname "$BB_CONFIG")"
cp "$SRC_BB" "$BB_CONFIG"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -v "$BB_CONFIG:/etc/blackbox_exporter/config.yml:ro" \
  "$BB_IMAGE" \
  --config.file=/etc/blackbox_exporter/config.yml \
  --web.listen-address=127.0.0.1:9115

echo "blackbox_exporter started: $CONTAINER (127.0.0.1:9115)"

sleep 2
if curl -sf "http://127.0.0.1:9115/metrics" | head -1 | grep -q '^#'; then
  echo "blackbox_exporter health: OK"
else
  echo "WARN: blackbox_exporter metrics check failed" >&2
  exit 1
fi
