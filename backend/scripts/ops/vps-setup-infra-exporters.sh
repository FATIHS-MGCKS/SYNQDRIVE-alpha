#!/usr/bin/env bash
# Bootstrap all SynqDrive infrastructure exporters on the production VPS.
#
# Installs (Docker, localhost-only):
#   - node_exporter      :9100
#   - cadvisor           :9323  (Docker/container metrics)
#   - postgres_exporter  :9187
#   - redis_exporter     :9121
#   - nginx_exporter     :9113  (requires nginx stub_status snippet)
#   - blackbox_exporter  :9115
#
# ClickHouse exposes native Prometheus on :9363 (config in clickhouse prometheus.xml).
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-infra-exporters.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run() {
  local script="$1"
  if [[ -x "$script" ]]; then
    echo "==> $(basename "$script")"
    bash "$script"
  else
    echo "WARN: missing $script" >&2
  fi
}

run "$SCRIPT_DIR/vps-setup-node-exporter.sh"
run "$SCRIPT_DIR/vps-setup-cadvisor.sh"
run "$SCRIPT_DIR/vps-setup-postgres-exporter.sh"
run "$SCRIPT_DIR/vps-setup-redis-exporter.sh"
run "$SCRIPT_DIR/vps-setup-nginx-exporter.sh"
run "$SCRIPT_DIR/vps-setup-blackbox-exporter.sh"

echo "==> Infrastructure exporters bootstrap complete"
echo "    ClickHouse: ensure prometheus.xml is mounted and port 9363 is reachable on localhost"
echo "    Nginx: apply nginx-stub-status.snippet if /nginx_status is not yet configured"
