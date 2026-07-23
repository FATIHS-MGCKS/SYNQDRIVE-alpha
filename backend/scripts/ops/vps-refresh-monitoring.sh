#!/usr/bin/env bash
# Refresh SynqDrive Prometheus + Grafana configs on the production VPS without full container recreate.
#
# - Copies prometheus.yml + alerts.yml from the current release tree
# - POST /-/reload when Prometheus is already running (--web.enable-lifecycle)
# - Copies Grafana provisioning + dashboards (incl. fleet-health-service)
# - Restarts Grafana when the container exists (dashboard file mounts are read-only)
#
# Bootstrap (first install) when containers are missing:
#   MONITORING_AUTO_BOOTSTRAP=1 bash vps-refresh-monitoring.sh
#
# Run on VPS (typical after deploy):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
GRAFANA_DIR="${GRAFANA_DIR:-/opt/synqdrive/shared/grafana}"
PROM_CONTAINER="${PROM_CONTAINER:-synqdrive-prometheus}"
GRAFANA_CONTAINER="${GRAFANA_CONTAINER:-synqdrive-grafana}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
AUTO_BOOTSTRAP="${MONITORING_AUTO_BOOTSTRAP:-0}"

SRC_PROM="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus"
SRC_GRAFANA="${SYNQDRIVE_ROOT}/backend/monitoring/grafana"

docker_container_running() {
  local name="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$name"
}

refresh_prometheus() {
  if [[ ! -f "$SRC_PROM/prometheus.vps.yml" ]]; then
    echo "WARN: $SRC_PROM/prometheus.vps.yml missing — skip Prometheus refresh" >&2
    return 0
  fi

  if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "WARN: $BACKEND_ENV missing — skip Prometheus refresh" >&2
    return 0
  fi

  local token
  token="$(grep '^METRICS_BEARER_TOKEN=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [[ -z "$token" ]]; then
    echo "WARN: METRICS_BEARER_TOKEN missing — skip Prometheus refresh" >&2
    return 0
  fi

  mkdir -p "$PROM_DIR/secrets"
  printf '%s' "$token" > "$PROM_DIR/secrets/metrics_bearer_token"
  chmod 644 "$PROM_DIR/secrets/metrics_bearer_token"

  cp "$SRC_PROM/alerts.yml" "$PROM_DIR/alerts.yml"
  cp "$SRC_PROM/prometheus.vps.yml" "$PROM_DIR/prometheus.yml"
  if [[ "$BACKEND_PORT" != "3001" ]]; then
    sed -i "s/127.0.0.1:3001/127.0.0.1:${BACKEND_PORT}/" "$PROM_DIR/prometheus.yml"
  fi

  if docker_container_running "$PROM_CONTAINER"; then
    echo "==> Prometheus: config synced, reloading $PROM_CONTAINER"
    if curl -sf -X POST "http://127.0.0.1:9090/-/reload" >/dev/null; then
      echo "Prometheus reload: OK"
    else
      echo "WARN: Prometheus reload failed — restarting container" >&2
      docker restart "$PROM_CONTAINER" >/dev/null
    fi
    return 0
  fi

  if [[ "$AUTO_BOOTSTRAP" == "1" ]]; then
    echo "==> Prometheus: container missing — bootstrap via vps-setup-prometheus.sh"
    bash "$SCRIPT_DIR/vps-setup-prometheus.sh"
    return 0
  fi

  echo "Prometheus: config synced to $PROM_DIR (container not running; set MONITORING_AUTO_BOOTSTRAP=1 to install)"
}

copy_grafana_dashboards() {
  cp "$SRC_GRAFANA/dashboards/synqdrive-ops.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-battery-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-driving-intelligence-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-document-intake-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-fleet-health-service.json" "$GRAFANA_DIR/dashboards/"
}

refresh_grafana() {
  if [[ ! -d "$SRC_GRAFANA/provisioning" ]]; then
    echo "WARN: $SRC_GRAFANA/provisioning missing — skip Grafana refresh" >&2
    return 0
  fi

  mkdir -p "$GRAFANA_DIR/provisioning/datasources" "$GRAFANA_DIR/provisioning/dashboards" "$GRAFANA_DIR/dashboards"
  cp -r "$SRC_GRAFANA/provisioning/"* "$GRAFANA_DIR/provisioning/"
  copy_grafana_dashboards

  if docker_container_running "$GRAFANA_CONTAINER"; then
    echo "==> Grafana: provisioning synced, restarting $GRAFANA_CONTAINER"
    docker restart "$GRAFANA_CONTAINER" >/dev/null
    sleep 5
    if curl -sf "http://127.0.0.1:3000/api/health" >/dev/null; then
      echo "Grafana health: OK"
    else
      echo "WARN: Grafana health check failed after restart" >&2
      return 1
    fi
    return 0
  fi

  if [[ "$AUTO_BOOTSTRAP" == "1" ]]; then
    echo "==> Grafana: container missing — bootstrap via vps-setup-grafana.sh"
    bash "$SCRIPT_DIR/vps-setup-grafana.sh"
    return 0
  fi

  echo "Grafana: configs synced to $GRAFANA_DIR (container not running; set MONITORING_AUTO_BOOTSTRAP=1 to install)"
}

echo "==> SynqDrive monitoring refresh (release: $SYNQDRIVE_ROOT)"
refresh_prometheus
refresh_grafana
echo "==> Monitoring refresh complete"
