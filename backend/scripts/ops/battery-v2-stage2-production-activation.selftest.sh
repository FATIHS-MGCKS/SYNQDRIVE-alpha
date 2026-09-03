#!/usr/bin/env bash
# Selftest for Battery V2 Stage-2 cutover contract helpers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

battery_v2_stage2_contract_is_valid true true true || exit 1
battery_v2_invalid_m31_contract_is_active false true || exit 1
if battery_v2_stage2_contract_reject_invalid false true 2>/dev/null; then
  echo "FAIL: expected invalid M3.1 rejection" >&2
  exit 1
fi
if battery_v2_stage2_contract_reject_invalid true true 2>/dev/null; then
  :
else
  echo "FAIL: expected Stage-2 acceptance" >&2
  exit 1
fi

if bash "${SCRIPT_DIR}/vps-enable-battery-v2-full-fleet-production.sh" 2>/dev/null; then
  echo "FAIL: deprecated script should fail closed" >&2
  exit 1
fi

echo "battery-v2-stage2-production-activation.selftest: OK"
