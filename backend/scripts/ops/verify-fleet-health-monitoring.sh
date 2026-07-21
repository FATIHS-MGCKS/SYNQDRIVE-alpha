#!/usr/bin/env bash
# Read-only verification that Fleet Health monitoring artifacts exist in the release tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DASHBOARD="${ROOT}/monitoring/grafana/dashboards/synqdrive-fleet-health-service.json"
ALERTS="${ROOT}/monitoring/prometheus/alerts.yml"
DOC="${ROOT}/../docs/architecture/fleet-health-grafana-prometheus-ops.md"

fail=0

check_file() {
  local path="$1"
  local label="$2"
  if [[ -f "$path" ]]; then
    echo "OK  $label"
  else
    echo "FAIL missing $label ($path)"
    fail=1
  fi
}

check_file "$DASHBOARD" "Grafana dashboard JSON (uid synqdrive-fleet-health-service)"
check_file "$ALERTS" "Prometheus alerts.yml"
check_file "$DOC" "Fleet Health Grafana ops doc"

if grep -q 'synqdrive_fleet_health' "$ALERTS" 2>/dev/null; then
  echo "OK  Prometheus alert group synqdrive_fleet_health"
else
  echo "FAIL synqdrive_fleet_health alerts not found in alerts.yml"
  fail=1
fi

if grep -q '"uid": "synqdrive-fleet-health-service"' "$DASHBOARD" 2>/dev/null; then
  echo "OK  Grafana dashboard uid"
else
  echo "FAIL dashboard uid mismatch"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Fleet Health monitoring artifacts incomplete. Import dashboard + reload Prometheus on VPS manually."
  exit 1
fi

echo ""
echo "Repo monitoring artifacts present. VPS import still required if not provisioned:"
echo "  - Grafana: import $DASHBOARD"
echo "  - Prometheus: include alerts.yml and reload"
