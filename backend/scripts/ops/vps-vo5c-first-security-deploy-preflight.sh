#!/usr/bin/env bash
# VO5C first security release — fail-closed pinned-executor preflight (no deploy).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"
# shellcheck source=lib/vps-vo5c-deploy-executor-selection.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-deploy-executor-selection.lib.sh"
# shellcheck source=lib/vps-vo5c-deploy-admission.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-deploy-admission.lib.sh"
# shellcheck source=lib/vps-deploy-controller.lib.sh
source "${SCRIPT_DIR}/lib/vps-deploy-controller.lib.sh"

PINNED_EXECUTOR_ROOT="${SYNQDRIVE_PINNED_EXECUTOR_ROOT:-}"
PINNED_EXECUTOR_SHA="${SYNQDRIVE_PINNED_EXECUTOR_SHA:-}"
REQUESTED_DEPLOY_SHA="${SYNQDRIVE_REQUESTED_DEPLOY_SHA:-}"
STAGED_RELEASE_ROOT="${SYNQDRIVE_STAGED_RELEASE_ROOT:-}"
S4F7Q_GATE="${SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE:-0}"
CURRENT_EXECUTOR_SCRIPT="${SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT:-/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh}"

abort() {
  vps_vo5c_log "PREFLIGHT_ABORT reason=$*"
  exit 1
}

if [[ -z "$PINNED_EXECUTOR_ROOT" || ! -d "$PINNED_EXECUTOR_ROOT" ]]; then
  abort "pinned_executor_root_missing"
fi

if [[ -z "$PINNED_EXECUTOR_SHA" ]] || ! vps_vo5c_is_full_sha "$PINNED_EXECUTOR_SHA"; then
  abort "pinned_executor_sha_invalid"
fi

if [[ -z "$REQUESTED_DEPLOY_SHA" ]] || ! vps_vo5c_is_full_sha "$REQUESTED_DEPLOY_SHA"; then
  abort "requested_deploy_sha_required"
fi

if [[ -z "$STAGED_RELEASE_ROOT" || ! -d "$STAGED_RELEASE_ROOT" ]]; then
  abort "staged_release_root_required"
fi

actual_executor_sha="$(git -C "$PINNED_EXECUTOR_ROOT" rev-parse HEAD 2>/dev/null || true)"
if [[ "$actual_executor_sha" != "$PINNED_EXECUTOR_SHA" ]]; then
  abort "pinned_executor_sha_mismatch actual=${actual_executor_sha:-unknown}"
fi

if ! vps_vo5c_verify_executor_tree_integrity "$PINNED_EXECUTOR_ROOT" "$PINNED_EXECUTOR_SHA"; then
  abort "pinned_executor_tree_integrity_failed"
fi

deploy_script="${PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-deploy-release.sh"
if [[ ! -f "$deploy_script" ]]; then
  abort "pinned_deploy_script_missing"
fi

if ! vps_vo5c_deploy_script_has_r2_bootstrap_markers "$deploy_script"; then
  abort "pinned_deploy_script_missing_r2_markers"
fi

if ! vps_vo5c_executor_root_has_r2_authority "$PINNED_EXECUTOR_ROOT"; then
  abort "pinned_executor_missing_r2_authority"
fi

vps_vo5c_load_authority_from_ops_dir "${PINNED_EXECUTOR_ROOT}/backend/scripts/ops" || abort "pinned_authority_load_failed"

if ! vps_vo5c_verify_ancestry_includes_floor "$PINNED_EXECUTOR_ROOT" "$PINNED_EXECUTOR_SHA"; then
  abort "pinned_executor_below_security_floor"
fi

staged_sha="$(vps_vo5c_release_head_sha "$STAGED_RELEASE_ROOT")"
if [[ -z "$staged_sha" ]]; then
  abort "staged_release_not_git_checkout"
fi
if [[ "$staged_sha" != "$REQUESTED_DEPLOY_SHA" ]]; then
  abort "staged_release_sha_mismatch"
fi
if ! vps_vo5c_assert_deploy_target_admitted "$STAGED_RELEASE_ROOT" "$REQUESTED_DEPLOY_SHA"; then
  abort "staged_deploy_target_not_admitted"
fi

replica_source="$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$deploy_script" "$S4F7Q_GATE")"
if [[ "$replica_source" != "release" ]]; then
  abort "pinned_executor_would_source_unprotected_replica_lib source=${replica_source}"
fi

if [[ "$S4F7Q_GATE" == "1" ]]; then
  vps_deploy_controller_verify_exact_sha || abort "external_controller_sha_mismatch"
  controller_ops="$(vps_deploy_controller_ops_dir)"
  if [[ ! -f "${controller_ops}/lib/vps-production-replica.lib.sh" ]]; then
    abort "external_controller_replica_lib_missing"
  fi
  vps_vo5c_log "external_controller_sha_verified=${EXPECTED_DEPLOY_CONTROLLER_SHA:-unknown}"
fi

if [[ -f "$CURRENT_EXECUTOR_SCRIPT" ]]; then
  if ! vps_vo5c_deploy_script_has_r2_bootstrap_markers "$CURRENT_EXECUTOR_SCRIPT"; then
    vps_vo5c_log "INFO legacy_current_executor_present path=${CURRENT_EXECUTOR_SCRIPT} (not used for execution)"
    abort "first_security_deploy_requires_pinned_executor_not_current"
  fi
  current_source="$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$CURRENT_EXECUTOR_SCRIPT" "$S4F7Q_GATE")"
  if [[ "$current_source" == "controller" ]]; then
    vps_vo5c_log "WARN current_executor_s4f7q_controller_replica_source"
  fi
fi

vps_vo5c_log "PREFLIGHT_PASS pinned_executor_sha=${PINNED_EXECUTOR_SHA} target_sha=${REQUESTED_DEPLOY_SHA} replica_source=${replica_source} s4f7q=${S4F7Q_GATE}"
exit 0
