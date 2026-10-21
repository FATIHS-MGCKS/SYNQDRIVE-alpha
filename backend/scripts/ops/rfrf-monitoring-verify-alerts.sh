#!/usr/bin/env bash
# Verify canonical F8 Physical Refuel alert rules — repo, loaded copy, and live Prometheus.
#
# Default: read-only verification (does NOT reload Prometheus).
# Usage:
#   bash rfrf-monitoring-verify-alerts.sh --check
#   bash rfrf-monitoring-verify-alerts.sh --check --live-required
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"

CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
LIVE_REQUIRED=0
BLOCKED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) shift ;;
    --live-required) LIVE_REQUIRED=1; shift ;;
    *)
      echo "Usage: $0 --check [--live-required]" >&2
      exit 2
      ;;
  esac
done

repo_alerts="$(rfrf_repo_alerts_file "$CURRENT")"
loaded_alerts="${PROM_DIR}/alerts.yml"

echo "=== RFRF MONITORING VERIFY live_required=${LIVE_REQUIRED} ==="
echo "REPO_ALERTS=${repo_alerts}"
echo "LOADED_ALERTS=${loaded_alerts}"

rfrf_verify_repo_alerts_subset "$repo_alerts" || BLOCKED=1
rfrf_promtool_check_rules "$repo_alerts" || BLOCKED=1

if [[ -f "$loaded_alerts" ]]; then
  if rfrf_verify_loaded_alerts "$loaded_alerts"; then
    echo "ALERT_RULES_LOADED_IN_PRODUCTION=YES"
    echo "F8_ALERT_FILES_PRESENT=YES"
  else
    echo "ALERT_RULES_LOADED_IN_PRODUCTION=NO"
    echo "F8_ALERT_FILES_PRESENT=NO"
    BLOCKED=1
  fi
  for name in "${RFRF_REQUIRED_F8_ALERTS[@]}"; do
    if ! grep -q "alert: ${name}" "$loaded_alerts"; then
      echo "DRIFT_MISSING=${name}"
      BLOCKED=1
    fi
  done
else
  echo "ALERT_RULES_LOADED_IN_PRODUCTION=NOT_PRESENT"
  echo "F8_ALERT_FILES_PRESENT=NO"
  BLOCKED=1
fi

rfrf_observability_topology_check "${PROM_DIR}/prometheus.yml" || BLOCKED=1

if (( LIVE_REQUIRED )) || [[ "${RFRF_MONITORING_LIVE_REQUIRED:-0}" == "1" ]]; then
  rfrf_verify_live_observability_gates "${PROM_DIR}/prometheus.yml" || BLOCKED=1
else
  echo "LIVE_PROMETHEUS_GATE=SKIPPED"
fi

if (( BLOCKED )); then
  echo "RFRF_MONITORING_VERIFY=BLOCKED"
  exit 1
fi

echo "RFRF_MONITORING_VERIFY=PASS"
exit 0
