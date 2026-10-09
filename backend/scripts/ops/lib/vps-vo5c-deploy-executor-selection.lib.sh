#!/usr/bin/env bash
# Resolve which replica library a deploy executor would source (read-only simulation).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Returns stdout: release|controller|unknown
vps_vo5c_simulate_replica_lib_source_from_deploy_script() {
  local deploy_script_path=$1
  local s4f7q_gate=${2:-0}

  if [[ ! -f "$deploy_script_path" ]]; then
    echo "unknown"
    return 1
  fi

  if [[ "$s4f7q_gate" == "1" ]]; then
    if grep -q 'source "${CONTROLLER_OPS_DIR}/lib/vps-production-replica.lib.sh"' "$deploy_script_path" \
      && ! grep -q 'SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR' "$deploy_script_path"; then
      echo "controller"
      return 0
    fi
    if grep -q 'source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"' "$deploy_script_path"; then
      echo "release"
      return 0
    fi
    echo "unknown"
    return 1
  fi

  if grep -q 'source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"' "$deploy_script_path"; then
    echo "release"
    return 0
  fi
  echo "unknown"
  return 1
}

vps_vo5c_deploy_script_has_r2_bootstrap_markers() {
  local deploy_script_path=$1
  [[ -f "$deploy_script_path" ]] \
    && grep -q 'vps-vo5c-security-floor.lib.sh' "$deploy_script_path" \
    && grep -q 'vps_vo5c_require_rollback_guard_ready' "$deploy_script_path" \
    && grep -q 'SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR' "$deploy_script_path" \
    && grep -q 'vps_vo5c_assert_deploy_target_admitted' "$deploy_script_path"
}

vps_vo5c_executor_root_has_r2_authority() {
  local executor_root=$1
  local ops="${executor_root}/backend/scripts/ops"
  [[ -f "${ops}/lib/vps-vo5c-security-floor.lib.sh" ]] \
    && [[ -f "${ops}/lib/vps-production-replica.lib.sh" ]] \
    && grep -q 'VO5C rollback authority library missing' "${ops}/lib/vps-production-replica.lib.sh" 2>/dev/null
}
