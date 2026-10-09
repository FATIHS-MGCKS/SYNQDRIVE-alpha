#!/usr/bin/env bash
# EXP-021 S4F-7AS — Gate-6 GLOBAL kill OPEN (KILLED→NOT_KILLED) and EMERGENCY_REKILL (NOT_KILLED→KILLED).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F7AS_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7AS_SCRIPT_DIR
S4F7J_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7J_SCRIPT_DIR
S4F4_SCRIPT_DIR="$SCRIPT_DIR"
export S4F4_SCRIPT_DIR
S4F7AO_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7AO_SCRIPT_DIR
S4F7F_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7F_SCRIPT_DIR

# shellcheck source=lib/di-v0-s4-global-kill-init-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-global-kill-init-production.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"
# shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
# shellcheck source=lib/di-v0-s4-five-flag-tiny-activation-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-five-flag-tiny-activation-production.lib.sh"
# shellcheck source=lib/di-v0-s4-gate6-open-rekill-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-gate6-open-rekill-production.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
s4f7as_export_canonical_backend_env || {
  echo "BACKEND_ENV_CANONICAL_RESOLUTION_FAILED=YES"
  exit 1
}

MODE="${DI_S4_GATE6_OPERATOR_MODE:-}"
if [[ "$MODE" != "OPEN" && "$MODE" != "EMERGENCY_REKILL" ]]; then
  echo "OPERATOR_MODE_INVALID=YES"
  echo "REQUIRED_MODE=OPEN|EMERGENCY_REKILL"
  exit 1
fi

echo "EXP021_S4F7AS_GATE6_OPEN_REKILL_WRAPPER=1"
echo "OPERATOR_MODE=${MODE}"
echo "GLOBAL_DB_MUTATION_SUPPORTED=YES"
echo "ENV_MUTATION_SUPPORTED=NO"
echo "RESTART_SUPPORTED=NO"
if [[ "$MODE" == "EMERGENCY_REKILL" ]]; then
  if ! s4f7as_execute_emergency_rekill_mode; then
    echo "FAIL_CLOSED=YES"
    exit 1
  fi
  exit 0
fi

if ! s4f7as_execute_open_mode; then
  echo "FAIL_CLOSED=YES"
  exit 1
fi
exit 0
