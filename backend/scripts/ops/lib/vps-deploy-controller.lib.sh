#!/usr/bin/env bash
# EXP-021 S4F-7R — immutable deploy-controller root verification (not application runtime).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

vps_deploy_controller_log() {
  printf '[deploy-controller] %s\n' "$*"
}

vps_deploy_controller_require_root() {
  if [[ -z "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT:-}" ]]; then
    vps_deploy_controller_log "ABORT: SYNQDRIVE_DEPLOY_CONTROLLER_ROOT is required for guarded exact-RC deploy"
    return 1
  fi
  if [[ ! -d "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}/backend/scripts/ops" ]]; then
    vps_deploy_controller_log "ABORT: invalid controller root (missing backend/scripts/ops): ${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}"
    return 1
  fi
  return 0
}

vps_deploy_controller_verify_exact_sha() {
  local expected="${EXPECTED_DEPLOY_CONTROLLER_SHA:-}"
  if [[ -z "$expected" ]]; then
    vps_deploy_controller_log "ABORT: EXPECTED_DEPLOY_CONTROLLER_SHA is required (40-char hex, no branch authority)"
    return 1
  fi
  if [[ ! "$expected" =~ ^[0-9a-f]{40}$ ]]; then
    vps_deploy_controller_log "ABORT: EXPECTED_DEPLOY_CONTROLLER_SHA must be 40-char lowercase hex"
    return 1
  fi
  if ! vps_deploy_controller_require_root; then
    return 1
  fi
  local actual
  actual="$(git -C "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}" rev-parse HEAD 2>/dev/null || true)"
  if [[ "$actual" != "$expected" ]]; then
    vps_deploy_controller_log "ABORT: controller SHA ${actual:-UNKNOWN} != expected ${expected}"
    return 1
  fi
  vps_deploy_controller_log "Controller SHA verified: ${expected:0:12}"
  return 0
}

vps_deploy_controller_ops_dir() {
  echo "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}/backend/scripts/ops"
}

vps_deploy_controller_guarded_mode_active() {
  [[ "${SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE:-0}" == "1" ]]
}
