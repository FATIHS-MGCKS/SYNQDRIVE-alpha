#!/usr/bin/env bash
# P4B16 — Deploy/rollback hooks (load from candidate release ops dir).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Exit code when replicas are verified but attestation persistence failed (no app rollback).
VPS_P4B16_PARTIAL_SUCCESS_RC=3

vps_p4b16_is_partial_success_rc() {
  local rc=$1
  [[ "$rc" -eq "${VPS_P4B16_PARTIAL_SUCCESS_RC}" ]]
}

# Rollback restored replicas (0) or only attestation incomplete (3) — not a physical rollback failure.
vps_p4b16_rollback_runtime_ok() {
  local rc=$1
  [[ "$rc" -eq 0 ]] || vps_p4b16_is_partial_success_rc "$rc"
}

vps_p4b16_shared_backend_env() {
  echo "${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
}

vps_p4b16_attestation_lib_path() {
  local release_ops_dir=$1
  echo "${release_ops_dir}/lib/vps-release-attestation.lib.sh"
}

vps_p4b16_load_attestation() {
  local release_ops_dir=$1
  local lib
  lib="$(vps_p4b16_attestation_lib_path "$release_ops_dir")"
  if [[ ! -f "$lib" ]]; then
    return 1
  fi
  # shellcheck source=lib/vps-release-attestation.lib.sh
  source "$lib"
  export VPS_ATTESTATION_BACKEND_ENV="$(vps_p4b16_shared_backend_env)"
  return 0
}

vps_p4b16_log_partial_success() {
  local context=$1
  printf '!! PARTIAL_SUCCESS: replicas verified for %s; P4B16 attestation not durable (reconcile release-attestation.state + backend.env mirror)\n' "$context" >&2
}

# Call only after vps_replica_verify_post_deploy PASS (deploy path).
vps_p4b16_publish_after_deploy_verify() {
  local release_ops_dir=$1
  local release_dir=$2
  local target_sha=$3

  if ! vps_p4b16_load_attestation "$release_ops_dir"; then
    echo "!! P4B16 integration active but core attestation library missing — attestation incomplete" >&2
    vps_p4b16_log_partial_success "deploy ${target_sha:0:12} (missing core lib)"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi

  if ! vps_attest_lock_acquire; then
    vps_p4b16_log_partial_success "deploy ${target_sha:0:12}"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi
  if ! vps_attest_record_deploy_success "$release_dir" "$target_sha"; then
    vps_attest_lock_release
    vps_p4b16_log_partial_success "deploy ${target_sha:0:12}"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi
  vps_attest_lock_release
  echo "==> P4B16 attestation recorded DEPLOYED_SHA=${target_sha:0:12}"
  return 0
}

# Call only after rollback vps_replica_verify_post_deploy PASS.
vps_p4b16_publish_after_rollback_verify() {
  local release_ops_dir=$1
  local release_dir=$2
  local restored_sha=$3

  if ! vps_p4b16_load_attestation "$release_ops_dir"; then
    echo "!! P4B16 integration active but core attestation library missing — rollback attestation incomplete" >&2
    vps_p4b16_log_partial_success "rollback ${restored_sha:0:12} (missing core lib)"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi

  if ! vps_attest_lock_acquire; then
    vps_p4b16_log_partial_success "rollback ${restored_sha:0:12}"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi
  if ! vps_attest_record_rollback_success "$release_dir" "$restored_sha"; then
    vps_attest_lock_release
    vps_p4b16_log_partial_success "rollback ${restored_sha:0:12}"
    return "${VPS_P4B16_PARTIAL_SUCCESS_RC}"
  fi
  vps_attest_lock_release
  echo "==> P4B16 attestation recorded rollback DEPLOYED_SHA=${restored_sha:0:12}"
  return 0
}

# Failed/denied rollback: affirm current runtime vs recorded state; never publish new SHA.
vps_p4b16_on_rollback_denied() {
  local release_ops_dir=$1
  local release_dir=$2

  if ! vps_p4b16_load_attestation "$release_ops_dir"; then
    return 0
  fi
  if ! vps_attest_lock_acquire; then
    return 0
  fi
  vps_attest_record_rollback_denied "$release_dir" || true
  vps_attest_lock_release
  return 0
}
