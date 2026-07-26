#!/usr/bin/env bash
# Install or refresh cAdvisor (Docker/container metrics) on the production VPS.
#
# Exposes container CPU/memory/network on 127.0.0.1:9323
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-cadvisor.sh
set -euo pipefail

CADVISOR_IMAGE="${CADVISOR_IMAGE:-gcr.io/cadvisor/cadvisor:v0.49.1}"
CONTAINER="${CONTAINER:-synqdrive-cadvisor}"
LISTEN_PORT="${CADVISOR_PORT:-9323}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  --volume /:/rootfs:ro \
  --volume /var/run:/var/run:ro \
  --volume /sys:/sys:ro \
  --volume /var/lib/docker/:/var/lib/docker:ro \
  --volume /dev/disk/:/dev/disk:ro \
  --privileged \
  --device /dev/kmsg \
  "$CADVISOR_IMAGE" \
  --listen_ip=127.0.0.1 \
  --port="$LISTEN_PORT"

echo "cAdvisor started: $CONTAINER (127.0.0.1:${LISTEN_PORT})"

sleep 3
if curl -sf "http://127.0.0.1:${LISTEN_PORT}/metrics" | head -1 | grep -q '^#'; then
  echo "cAdvisor health: OK"
else
  echo "WARN: cAdvisor metrics check failed" >&2
  exit 1
fi
