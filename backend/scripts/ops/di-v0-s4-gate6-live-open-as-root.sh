#!/usr/bin/env bash
# Pinned root re-exec for Gate-6 LIVE_OPEN — no broad sudo -E env pass-through.
set -euo pipefail

INTENT_FILE="${1:-}"
WRAPPER_SCRIPT="${2:-}"

if [[ -z "$INTENT_FILE" || -z "$WRAPPER_SCRIPT" || ! -f "$INTENT_FILE" || ! -f "$WRAPPER_SCRIPT" ]]; then
  echo "ROOT_REEXEC_ARGS_INVALID=YES"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ROOT_REEXEC_REQUIRES_EUID_ZERO=YES"
  exit 1
fi

WRAPPER_REAL="$(readlink -f "$WRAPPER_SCRIPT")"
SCRIPT_DIR="$(cd "$(dirname "$WRAPPER_REAL")" && pwd)"
ALLOWED_WRAPPER="${SCRIPT_DIR}/di-v0-s4-gate6-open-rekill-production.sh"
if [[ "$WRAPPER_REAL" != "$(readlink -f "$ALLOWED_WRAPPER")" ]]; then
  echo "ROOT_REEXEC_WRAPPER_NOT_PINNED=YES"
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
exec bash "$WRAPPER_REAL"
