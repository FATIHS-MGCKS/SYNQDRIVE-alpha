#!/usr/bin/env bash
# Read-only Battery V2 Stage-2 corrected activation preflight (PKG-01 safety gate).
# Does NOT mutate production.
#
# Usage:
#   sudo bash battery-v2-stage2-production-preflight.sh
#   DRY_RUN=1 sudo bash battery-v2-stage2-production-preflight.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
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

echo "--- SCHEDULER LEADERS ---"
LEADERS=0
for port in 3001 3002; do
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || echo '{}')
  role=$(printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('checks',{}).get('schedulerLeader',{}).get('details',{}).get('role','UNKNOWN'))" 2>/dev/null || echo UNKNOWN)
  echo "port_${port}_role=${role}"
  if [[ "$role" == "LEADER" ]]; then LEADERS=$((LEADERS + 1)); fi
done
echo "SCHEDULER_LEADERS=${LEADERS}"

if [[ -f "$BACKEND_ENV" ]]; then
  set +u
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a
  PSQL_URL="${DATABASE_URL%%\?*}"
  echo "--- PKG01 ENQUEUED non-VALID (requires code guard + terminalization) ---"
  NON_VALID_ENQUEUED=$(psql "$PSQL_URL" -t -A -c "
    SELECT COUNT(*)
    FROM battery_measurements m
    INNER JOIN battery_measurement_sessions s
      ON s.id = m.session_id AND s.organization_id = m.organization_id
    WHERE m.type IN ('REST_60M','REST_6H')
      AND m.quality <> 'VALID'
      AND COALESCE(s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'status'], 'MISSING') = 'ENQUEUED'
      AND m.created_at >= NOW() - INTERVAL '7 days';" | tr -d '[:space:]')
  echo "PKG01_ENQUEUED_NON_VALID=${NON_VALID_ENQUEUED:-ERR}"
  echo "PKG01_PRE_CUTOVER_GUARD_NOTE=non-VALID ENQUEUED rows terminalize without assess enqueue after quality-gate deploy"
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
