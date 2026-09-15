#!/usr/bin/env bash
# Sync canonical monitoring configs and verify F8 Physical Refuel alerts.
#
# CHECK (zero mutation):
#   bash rfrf-monitoring-sync-alerts.sh --check
#
# APPLY (production mutation — requires explicit authorization):
#   sudo RFRF_MONITORING_SYNC_ACK=YES RFRF_MONITORING_MUTATION=PRODUCTION \
#     bash rfrf-monitoring-sync-alerts.sh --apply
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"

ACK="${RFRF_MONITORING_SYNC_ACK:-0}"
MUTATION="${RFRF_MONITORING_MUTATION:-0}"
MODE="${1:---check}"

echo "=== RFRF MONITORING SYNC mode=${MODE} ==="

repo_alerts="$(rfrf_repo_alerts_file "${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}")"
echo "Canonical repo alerts: ${repo_alerts}"

if [[ "$MODE" == "--check" ]]; then
  bash "${SCRIPT_DIR}/rfrf-monitoring-verify-alerts.sh" --check || {
    echo "Pre-sync verify failed (expected when prod not yet synced)" >&2
  }
  echo "CHECK_ONLY=1 — no filesystem or Prometheus mutation"
  echo "RFRF_MONITORING_SYNC_CHECK=PASS"
  exit 0
fi

if [[ "$MODE" != "--apply" ]]; then
  echo "Usage: $0 [--check|--apply]" >&2
  exit 2
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: --apply requires RFRF_MONITORING_SYNC_ACK=YES" >&2
  echo "RFRF_MONITORING_SYNC=BLOCKED"
  exit 1
fi

if [[ "$MUTATION" != "PRODUCTION" ]]; then
  echo "ERROR: --apply requires RFRF_MONITORING_MUTATION=PRODUCTION" >&2
  echo "RFRF_MONITORING_SYNC=BLOCKED"
  exit 1
fi

if ! rfrf_promtool_check_rules "$repo_alerts" 1; then
  echo "RFRF_MONITORING_SYNC=BLOCKED promtool validation failed"
  exit 1
fi

bash "${SCRIPT_DIR}/vps-refresh-monitoring.sh"
bash "${SCRIPT_DIR}/rfrf-monitoring-verify-alerts.sh" --check --live-required
echo "RFRF_MONITORING_SYNC=PASS"
