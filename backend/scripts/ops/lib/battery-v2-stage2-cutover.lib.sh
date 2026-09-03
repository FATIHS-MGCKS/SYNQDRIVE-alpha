#!/usr/bin/env bash
# Battery V2 Stage-2 cutover contract helpers (shell + CI selftests).
set -euo pipefail

battery_v2_stage2_contract_expected() {
  cat <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
EOF
}

battery_v2_stage2_contract_is_valid() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  local reconciliation="${3:-true}"
  [[ "$rest_shadow" == "true" && "$publication" == "true" && "$reconciliation" == "true" ]]
}

battery_v2_invalid_m31_contract_is_active() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  [[ "$rest_shadow" == "false" && "$publication" == "true" ]]
}

battery_v2_stage2_contract_reject_invalid() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  if battery_v2_invalid_m31_contract_is_active "$rest_shadow" "$publication"; then
    echo "ERROR: invalid M3.1 contract REST_SHADOW=false + PUBLICATION=true disables canonical REST pipeline" >&2
    echo "Use vps-enable-battery-v2-stage2-production.sh (Stage-2: REST_SHADOW=true + PUBLICATION=true)" >&2
    return 1
  fi
  if ! battery_v2_stage2_contract_is_valid "$rest_shadow" "$publication"; then
    echo "ERROR: Stage-2 contract requires REST_SHADOW=true, PUBLICATION=true, RECONCILIATION=true" >&2
    return 1
  fi
}
