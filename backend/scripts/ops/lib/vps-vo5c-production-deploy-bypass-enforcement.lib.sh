#!/usr/bin/env bash
# VO5C P4B15 — fail-closed production deploy authority when enforcement is installed on VPS.
# Enforcement state is read only from a root-owned authority file (not caller-controlled env).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE_DEFAULT='/opt/synqdrive/shared/vo5c-production-deploy-authority.env'
_VO5C_CANONICAL_DEPLOY_SCRIPT_SUFFIX='backend/scripts/ops/vps-deploy-release.sh'

vps_vo5c_production_deploy_authority_file() {
  if [[ "${SYNQDRIVE_VO5C_DEPLOY_SELFTEST:-0}" == "1" && -n "${SYNQDRIVE_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE:-}" ]]; then
    printf '%s' "${SYNQDRIVE_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE}"
    return 0
  fi
  printf '%s' "${_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE_DEFAULT}"
}

_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=0
_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0

vps_vo5c_load_production_deploy_authority() {
  local authority_file active pinned_root pinned_sha
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED}" == "1" ]]; then
    return 0
  fi
  authority_file="$(vps_vo5c_production_deploy_authority_file)"
  _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0
  if [[ ! -f "$authority_file" ]]; then
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
    return 0
  fi
  # shellcheck disable=SC1090
  if ! source "$authority_file" 2>/dev/null; then
    vps_vo5c_log "ABORT: production_deploy_authority_file_unreadable"
    return 1
  fi
  active="${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE:-0}"
  pinned_root="${SYNQDRIVE_PINNED_EXECUTOR_ROOT:-}"
  pinned_sha="${SYNQDRIVE_PINNED_EXECUTOR_SHA:-}"
  if [[ "$active" == "1" ]]; then
    if [[ -z "$pinned_root" || -z "$pinned_sha" ]]; then
      vps_vo5c_log "ABORT: production_deploy_authority_incomplete"
      return 1
    fi
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1
  fi
  _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
  return 0
}

vps_vo5c_production_deploy_enforcement_active() {
  if ! vps_vo5c_load_production_deploy_authority; then
    return 1
  fi
  [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" == "1" ]]
}

vps_vo5c_realpath_or_pwd() {
  local path=$1
  if command -v realpath >/dev/null 2>&1; then
    realpath "$path" 2>/dev/null || printf '%s' "$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  else
    printf '%s' "$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  fi
}

vps_vo5c_assert_production_deploy_canonical_authority() {
  local executor_root=$1
  local requested_sha=$2
  local authority_file pinned_root pinned_sha
  local executor_root_real pinned_root_real canonical_deploy expected_deploy

  if ! vps_vo5c_load_production_deploy_authority; then
    return 1
  fi
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" != "1" ]]; then
    return 0
  fi

  authority_file="$(vps_vo5c_production_deploy_authority_file)"
  # shellcheck disable=SC1090
  source "$authority_file"
  pinned_root="${SYNQDRIVE_PINNED_EXECUTOR_ROOT:?}"
  pinned_sha="${SYNQDRIVE_PINNED_EXECUTOR_SHA:?}"

  if [[ "${SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED:-0}" != "1" ]]; then
    vps_vo5c_log "ABORT: production_deploy_human_authorization_required"
    return 1
  fi

  executor_root_real="$(vps_vo5c_realpath_or_pwd "$executor_root")"
  pinned_root_real="$(vps_vo5c_realpath_or_pwd "$pinned_root")"
  if [[ "$executor_root_real" != "$pinned_root_real" ]]; then
    vps_vo5c_log "ABORT: production_deploy_non_pinned_executor root=${executor_root_real} required=${pinned_root_real}"
    return 1
  fi

  canonical_deploy="${pinned_root_real}/${_VO5C_CANONICAL_DEPLOY_SCRIPT_SUFFIX}"
  expected_deploy="$(vps_vo5c_realpath_or_pwd "${executor_root}/${_VO5C_CANONICAL_DEPLOY_SCRIPT_SUFFIX}")"
  if [[ "$expected_deploy" != "$(vps_vo5c_realpath_or_pwd "$canonical_deploy")" ]]; then
    vps_vo5c_log "ABORT: production_deploy_script_path_mismatch"
    return 1
  fi

  if ! declare -F vps_vo5c_verify_executor_tree_integrity >/dev/null; then
    vps_vo5c_log "ABORT: production_deploy_integrity_lib_missing"
    return 1
  fi
  if ! vps_vo5c_verify_executor_tree_integrity "$pinned_root" "$pinned_sha"; then
    return 1
  fi

  if ! declare -F vps_vo5c_verify_ancestry_includes_floor >/dev/null; then
    vps_vo5c_log "ABORT: production_deploy_floor_lib_missing"
    return 1
  fi
  if ! vps_vo5c_verify_ancestry_includes_floor "$pinned_root" "$pinned_sha"; then
    vps_vo5c_log "ABORT: production_deploy_pinned_executor_below_security_floor"
    return 1
  fi

  if [[ -n "$requested_sha" ]] && vps_vo5c_is_full_sha "$requested_sha"; then
    if ! vps_vo5c_verify_ancestry_includes_floor "$pinned_root" "$requested_sha"; then
      vps_vo5c_log "ABORT: production_deploy_target_below_security_floor sha=${requested_sha}"
      return 1
    fi
  fi

  vps_vo5c_log "production_deploy_canonical_authority_ok pinned=${pinned_sha} target=${requested_sha:-unset}"
  return 0
}

vps_vo5c_assert_not_direct_deploy_when_enforcement_active() {
  local ops_dir=$1
  local deploy_script="${ops_dir}/vps-deploy-release.sh"
  if ! vps_vo5c_production_deploy_enforcement_active; then
    return 0
  fi
  vps_vo5c_log "ABORT: production_deploy_must_use_vps_vo5c_run_pinned_security_deploy"
  return 1
}
