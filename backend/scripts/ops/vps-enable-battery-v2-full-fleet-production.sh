#!/usr/bin/env bash
# DEPRECATED — fails closed. Use vps-enable-battery-v2-stage2-production.sh instead.
#
# This script previously set REST_SHADOW=false + PUBLICATION=true, which disables the
# canonical REST pipeline per battery-v2-cutover.policy.spec.ts Stage-2 contract.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

echo "ERROR: vps-enable-battery-v2-full-fleet-production.sh is DEPRECATED and blocked." >&2
echo "It applied invalid M3.1 contract REST_SHADOW=false + PUBLICATION=true." >&2
echo "Use: sudo bash ${SCRIPT_DIR}/vps-enable-battery-v2-stage2-production.sh" >&2
battery_v2_stage2_contract_reject_invalid false true || true
exit 1
