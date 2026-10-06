#!/usr/bin/env bash
# EXP-021 S4F-7Q — exact-RC PRESTATE attestation rolling gate (opt-in only).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7Q_FROZEN_TARGET_RC_SHA="9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4"
S4F7Q_FROZEN_OLD_PRODUCTION_SHA="ee9588548845c8077aa0cba0684b06eac7c9d4d2"
S4F7Q_SHARED_BACKEND_ENV="${SYNQDRIVE_SHARED_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

s4f7q_log() {
  printf '[s4f7q-exact-rc-attestation] %s\n' "$*"
}

s4f7q_cli_path() {
  echo "${SYNQDRIVE_CURRENT_LINK}/backend/scripts/ops/di-v0-s4f7q-exact-rc-attestation-deploy/di-v0-s4f7q-exact-rc-attestation-deploy-cli.ts"
}

s4f7q_run_cli() {
  local backend_root="${SYNQDRIVE_CURRENT_LINK}/backend"
  (
    cd "$backend_root"
    npx --yes ts-node --transpile-only "$(s4f7q_cli_path)" "$@"
  )
}

s4f7q_verify_replica_prestate_attestation() {
  local port=$1
  local env_file="${S4F7Q_SHARED_BACKEND_ENV}"
  if [[ ! -f "$env_file" ]]; then
    s4f7q_log "ABORT: missing backend env ${env_file}"
    return 1
  fi
  if ! s4f7q_run_cli fetch-verify-prestate "$env_file" "$port"; then
    s4f7q_log "ABORT: replica PRESTATE attestation failed on port ${port}"
    return 1
  fi
  return 0
}

vps_replica_rolling_deploy_s4f7q_gated() {
  local release_dir=$1
  local target_sha=$2

  if [[ "$target_sha" != "$S4F7Q_FROZEN_TARGET_RC_SHA" ]]; then
    vps_replica_log "ABORT: S4F-7Q gate requires TARGET_SHA=${S4F7Q_FROZEN_TARGET_RC_SHA:0:12}"
    return 1
  fi

  local observed_old
  observed_old="$(vps_replica_release_sha "$(vps_replica_current_release_dir)")"
  if [[ "$observed_old" != "$S4F7Q_FROZEN_OLD_PRODUCTION_SHA" ]]; then
    vps_replica_log "ABORT: S4F-7Q gate requires OLD_PRODUCTION_SHA=${S4F7Q_FROZEN_OLD_PRODUCTION_SHA:0:12} (observed ${observed_old:0:12})"
    return 1
  fi

  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  s4f7q_verify_replica_prestate_attestation "${SYNQDRIVE_REPLICA_A_PORT}" || {
    vps_replica_log "REPLICA_B_RESTART_ATTEMPTED=NO"
    return 1
  }

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    s4f7q_verify_replica_prestate_attestation "${SYNQDRIVE_REPLICA_B_PORT}" || return 1
  fi

  return 0
}
