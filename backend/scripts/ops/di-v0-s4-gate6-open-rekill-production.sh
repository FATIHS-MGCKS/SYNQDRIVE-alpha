#!/usr/bin/env bash
# EXP-021 — Gate-6 operator: PREFLIGHT | DRY_RUN | LIVE_OPEN | EMERGENCY_REKILL
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
if [[ "$MODE" != "PREFLIGHT" && "$MODE" != "DRY_RUN" && "$MODE" != "LIVE_OPEN" && "$MODE" != "EMERGENCY_REKILL" && "$MODE" != "OPEN" ]]; then
  echo "OPERATOR_MODE_INVALID=YES"
  echo "REQUIRED_MODE=PREFLIGHT|DRY_RUN|LIVE_OPEN|EMERGENCY_REKILL"
  exit 1
fi

# Legacy OPEN mode maps to DRY_RUN or LIVE_OPEN via DRY_RUN env.
if [[ "$MODE" == "OPEN" ]]; then
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    MODE="DRY_RUN"
  else
    MODE="LIVE_OPEN"
  fi
fi

if [[ "$MODE" == "LIVE_OPEN" && "$(id -u)" -ne 0 && "${DI_S4_GATE6_ROOT_REEXEC_DONE:-}" != "1" ]]; then
  if [[ -z "${DI_S4_GATE6_PILOT_VEHICLE_CONFIRM:-}" && "${DI_S4_GATE6_ROLLOUT_WAVE:-}" == "1" ]]; then
    echo "PILOT_VEHICLE_CONFIRM_MISSING=YES"
    exit 1
  fi
  if [[ -z "${DI_S4_GATE6_ROLLOUT_WAVE:-}" ]]; then
    echo "ROLLOUT_WAVE_MISSING=YES"
    exit 1
  fi
  if [[ "${DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM:-}" != "${DI_S4_GATE6_ROLLOUT_WAVE}" ]]; then
    echo "ROLLOUT_WAVE_CONFIRM_MISMATCH=YES"
    exit 1
  fi
  echo "LIVE_OPEN_ROOT_REEXEC=YES"
  intent="$(mktemp)"
  chmod 600 "$intent"
  {
    printf '%s=%s\n' DI_S4_GATE6_OPERATOR_MODE LIVE_OPEN
    printf '%s=%s\n' DI_S4_GATE6_WRAPPER_ACTION LIVE_OPEN
    printf '%s=%s\n' DI_S4_GATE6_WRAPPER_ATTESTATION "${DI_S4_GATE6_WRAPPER_ATTESTATION:-SYNQDRIVE_GATE6_PINNED_WRAPPER_V1}"
    printf '%s=%s\n' DI_S4_GATE6_OPEN_ACK "${DI_S4_GATE6_OPEN_ACK:-}"
    printf '%s=%s\n' DI_S4_GATE6_OPEN_AUTHORIZED "${DI_S4_GATE6_OPEN_AUTHORIZED:-}"
    printf '%s=%s\n' DI_S4_GATE6_OPERATOR_REASON "${DI_S4_GATE6_OPERATOR_REASON:-}"
    printf '%s=%s\n' DI_S4_GATE6_OPERATOR_ACTOR "${DI_S4_GATE6_OPERATOR_ACTOR:-}"
    printf '%s=%s\n' DI_S4_GATE6_PILOT_VEHICLE_CONFIRM "${DI_S4_GATE6_PILOT_VEHICLE_CONFIRM:-}"
    printf '%s=%s\n' DI_S4_GATE6_ROLLOUT_WAVE "${DI_S4_GATE6_ROLLOUT_WAVE}"
    printf '%s=%s\n' DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM "${DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM}"
    printf '%s=%s\n' DRY_RUN 0
    printf '%s=%s\n' SYNQDRIVE_BACKEND_ENV "${SYNQDRIVE_BACKEND_ENV:-}"
    printf '%s=%s\n' BACKEND_ENV "${BACKEND_ENV:-}"
    printf '%s=%s\n' SYNQDRIVE_BACKEND_ENV_CANONICAL "${SYNQDRIVE_BACKEND_ENV_CANONICAL:-}"
    printf '%s=%s\n' DI_S4_TINY_STAGING_REQUIRED_SHA "${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
    printf '%s=%s\n' DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID "${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
    printf '%s=%s\n' DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 "${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
  } >"$intent"
  exec sudo -n "${SCRIPT_DIR}/di-v0-s4-gate6-live-open-as-root.sh" "$intent" "$0"
fi

echo "EXP021_SIMPLE_GATE6_WRAPPER=1"
echo "OPERATOR_MODE=${MODE}"
export DI_S4_GATE6_WRAPPER_ACTION="$MODE"
s4f7as_export_wrapper_attestation || exit 1

case "$MODE" in
  PREFLIGHT)
    echo "GLOBAL_DB_MUTATION_SUPPORTED=NO"
    if ! s4f7as_execute_preflight_mode; then
      echo "FAIL_CLOSED=YES"
      exit 1
    fi
    ;;
  DRY_RUN)
    echo "GLOBAL_DB_MUTATION_SUPPORTED=TRANSACTIONAL_TEST"
    if ! s4f7as_execute_dry_run_mode; then
      echo "FAIL_CLOSED=YES"
      exit 1
    fi
    ;;
  LIVE_OPEN)
    echo "GLOBAL_DB_MUTATION_SUPPORTED=YES"
    if ! s4f7as_execute_live_open_mode; then
      echo "FAIL_CLOSED=YES"
      exit 1
    fi
    ;;
  EMERGENCY_REKILL)
    echo "GLOBAL_DB_MUTATION_SUPPORTED=YES"
    if ! s4f7as_execute_emergency_rekill_mode; then
      echo "FAIL_CLOSED=YES"
      exit 1
    fi
    ;;
esac
exit 0
