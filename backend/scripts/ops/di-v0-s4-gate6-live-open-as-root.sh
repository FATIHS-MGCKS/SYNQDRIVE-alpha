#!/usr/bin/env bash
# Pinned root re-exec for Gate-6 LIVE_OPEN — no broad sudo -E env pass-through.
set -euo pipefail

INTENT_FILE="${1:-}"

S4F7AS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/di-v0-s4-gate6-production-operator-paths.lib.sh
source "${S4F7AS_SCRIPT_DIR}/lib/di-v0-s4-gate6-production-operator-paths.lib.sh"

if [[ -z "$INTENT_FILE" ]]; then
  echo "ROOT_REEXEC_ARGS_INVALID=YES"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ROOT_REEXEC_REQUIRES_EUID_ZERO=YES"
  exit 1
fi

PINNED_HELPER="$S4F7AS_PINNED_ROOT_HELPER"
PINNED_WRAPPER="$S4F7AS_PINNED_PRODUCTION_WRAPPER"

SELF_REAL="$(readlink -f "${BASH_SOURCE[0]}")"
HELPER_REAL="$(readlink -f "$PINNED_HELPER")"
if [[ "$SELF_REAL" != "$HELPER_REAL" ]]; then
  echo "ROOT_REEXEC_HELPER_NOT_PINNED=YES"
  exit 1
fi

s4f7as_assert_production_execution_integrity || exit 1
s4f7as_validate_root_reexec_intent_file "$INTENT_FILE" || exit 1

if [[ -n "${NODE_OPTIONS:-}" || -n "${NPM_CONFIG_PREFIX:-}" || -n "${NPM_CONFIG_CACHE:-}" ]]; then
  echo "ROOT_ENV_INJECTION_BLOCKED=YES"
  exit 1
fi

ALLOWED_KEYS=(
  DI_S4_GATE6_OPERATOR_MODE
  DI_S4_GATE6_WRAPPER_ACTION
  DI_S4_GATE6_WRAPPER_ATTESTATION
  DI_S4_GATE6_OPEN_ACK
  DI_S4_GATE6_OPEN_AUTHORIZED
  DI_S4_GATE6_OPERATOR_REASON
  DI_S4_GATE6_OPERATOR_ACTOR
  DI_S4_GATE6_PILOT_VEHICLE_CONFIRM
  DI_S4_GATE6_ROLLOUT_WAVE
  DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM
  DRY_RUN
  SYNQDRIVE_BACKEND_ENV
  BACKEND_ENV
  SYNQDRIVE_BACKEND_ENV_CANONICAL
  DI_S4_TINY_STAGING_REQUIRED_SHA
  DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID
  DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256
)

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  local_allowed=0
  for allowed in "${ALLOWED_KEYS[@]}"; do
    if [[ "$key" == "$allowed" ]]; then
      local_allowed=1
      export "$key=$val"
      break
    fi
  done
  if [[ "$local_allowed" -eq 0 ]]; then
    echo "ROOT_REEXEC_INTENT_KEY_REJECTED=${key}"
    exit 1
  fi
done <"$INTENT_FILE"

export DI_S4_GATE6_ROOT_REEXEC_DONE=1
export DI_S4_GATE6_WRAPPER_ATTESTATION="${DI_S4_GATE6_WRAPPER_ATTESTATION:-SYNQDRIVE_GATE6_PINNED_WRAPPER_V1}"
export DI_S4_GATE6_OPERATOR_MODE=LIVE_OPEN
export DI_S4_GATE6_WRAPPER_ACTION=LIVE_OPEN
export DRY_RUN=0

rm -f "$INTENT_FILE"
exec bash "$PINNED_WRAPPER"
