#!/usr/bin/env bash
# Read-only Battery V2 Stage-2 corrected activation preflight (PKG-01 safety gate).
# Does NOT mutate production.
#
# Usage:
#   sudo bash battery-v2-stage2-production-preflight.sh
#   DRY_RUN=1 sudo bash battery-v2-stage2-production-preflight.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BATTERY_V2_OPS_SCRIPT_DIR="$SCRIPT_DIR"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
DRY_RUN="${DRY_RUN:-0}"

read_flag() {
  local key="$1"
  if [[ -f "$BACKEND_ENV" ]]; then
    grep -E "^${key}=" "$BACKEND_ENV" | tail -n1 | cut -d= -f2- || true
  fi
}

REST_SHADOW="$(read_flag BATTERY_V2_REST_SHADOW_ENABLED)"
PUBLICATION="$(read_flag BATTERY_V2_PUBLICATION_ENABLED)"
RECONCILIATION="$(read_flag BATTERY_V2_RECONCILIATION_ENABLED)"
if [[ -z "$RECONCILIATION" ]]; then RECONCILIATION=true; fi

echo "=== BATTERY_V2_STAGE2_PREFLIGHT ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) dry_run=${DRY_RUN} ==="
echo "CURRENT_REST_SHADOW=${REST_SHADOW:-unset}"
echo "CURRENT_PUBLICATION=${PUBLICATION:-unset}"
echo "CURRENT_RECONCILIATION=${RECONCILIATION}"

if battery_v2_invalid_m31_contract_is_active "${REST_SHADOW:-false}" "${PUBLICATION:-false}"; then
  echo "CURRENT_CONTRACT=INVALID_M3_1_MISMATCH"
else
  echo "CURRENT_CONTRACT=OTHER"
fi

echo "TARGET_CONTRACT=STAGE_2"
battery_v2_stage2_contract_expected

echo "--- SCHEDULER TOPOLOGY ---"
battery_v2_stage2_scheduler_topology_preflight

echo "--- PKG01 GUARD DEPLOYMENT ---"
battery_v2_stage2_verify_pkg01_guard_deployed

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "PKG01_ENQUEUED_TOTAL=ERR"
  echo "PKG01_ENQUEUED_VALID=ERR"
  echo "PKG01_ENQUEUED_NON_VALID=ERR"
  echo "PKG01_ENQUEUED_UNRESOLVED=ERR"
  echo "ERROR: backend.env missing — cannot audit PKG-01 backlog" >&2
  exit 1
fi

set +u
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a
PSQL_URL="${DATABASE_URL%%\?*}"

echo "--- PKG01 ENQUEUED backlog (full, no age bound) ---"
echo "PKG01_BACKLOG_SCOPE=ALL_ENQUEUED_REST_HANDOFF_IDENTITIES"
echo "PKG01_RUNTIME_RECONCILE_LOOKBACK_NOTE=reconciliation SQL uses bounded lookback; preflight audits full ENQUEUED backlog"

counts="$(battery_v2_stage2_pkg01_sql_counts "$PSQL_URL" | tr -d '[:space:]')"
IFS='|' read -r PKG01_ENQUEUED_TOTAL PKG01_ENQUEUED_VALID PKG01_ENQUEUED_NON_VALID PKG01_ENQUEUED_UNRESOLVED <<< "$counts"

echo "PKG01_ENQUEUED_TOTAL=${PKG01_ENQUEUED_TOTAL:-ERR}"
echo "PKG01_ENQUEUED_VALID=${PKG01_ENQUEUED_VALID:-ERR}"
echo "PKG01_ENQUEUED_NON_VALID=${PKG01_ENQUEUED_NON_VALID:-ERR}"
echo "PKG01_ENQUEUED_UNRESOLVED=${PKG01_ENQUEUED_UNRESOLVED:-ERR}"
echo "PKG01_PRE_CUTOVER_GUARD_NOTE=non-VALID ENQUEUED rows terminalize without assess enqueue after quality-gate deploy"

if ! battery_v2_stage2_pkg01_preflight_backlog_gate "${PKG01_ENQUEUED_VALID:-ERR}" "${PKG01_ENQUEUED_UNRESOLVED:-ERR}"; then
  exit 1
fi

echo "--- CONTRACT CHECK ---"
if battery_v2_stage2_contract_is_valid true true true; then
  echo "STAGE2_TARGET_CONTRACT_VALID=YES"
else
  echo "STAGE2_TARGET_CONTRACT_VALID=NO"
  exit 1
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=PASS (no mutations)"
  echo "CORRECTED_STAGE2_ACTIVATION_READY=PENDING_OPERATOR_EXECUTION"
  exit 0
fi

echo "PREFLIGHT_COMPLETE=YES"
