#!/usr/bin/env bash
# VO5C P4B15 — fail-closed production deploy authority when enforcement is installed on VPS.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE='/opt/synqdrive/shared/vo5c-production-deploy-authority.env'
_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ARMED_STAMP='/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed'
_VO5C_CANONICAL_DEPLOY_SCRIPT_SUFFIX='backend/scripts/ops/vps-deploy-release.sh'

# Always bind canonical path (ignore any predeclared Bash function override).
unset -f vps_vo5c_production_deploy_authority_file 2>/dev/null || true
vps_vo5c_production_deploy_authority_file() {
  printf '%s' "${_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE}"
}

unset -f vps_vo5c_production_deploy_enforcement_armed_stamp_file 2>/dev/null || true
vps_vo5c_production_deploy_enforcement_armed_stamp_file() {
  printf '%s' "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ARMED_STAMP}"
}

_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=0
_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0
_VO5C_PRODUCTION_DEPLOY_AUTHORITY_PRESENT=0
_VO5C_LOADED_PINNED_EXECUTOR_ROOT=''
_VO5C_LOADED_PINNED_EXECUTOR_SHA=''

vps_vo5c_validate_production_deploy_authority_payload() {
  local active=$1
  local pinned_root=$2
  local pinned_sha=$3

  case "$active" in
    0) return 0 ;;
    1)
      if [[ -z "$pinned_root" || -z "$pinned_sha" ]]; then
        vps_vo5c_log "ABORT: production_deploy_authority_incomplete"
        return 1
      fi
      if ! vps_vo5c_is_full_sha "$pinned_sha"; then
        vps_vo5c_log "ABORT: production_deploy_authority_invalid_pinned_sha"
        return 1
      fi
      if [[ ! -d "$pinned_root" ]]; then
        vps_vo5c_log "ABORT: production_deploy_authority_pinned_root_missing"
        return 1
      fi
      return 0
      ;;
    *)
      vps_vo5c_log "ABORT: production_deploy_authority_invalid_active_flag"
      return 1
      ;;
  esac
}

vps_vo5c_load_production_deploy_authority_from_path() {
  local authority_file=$1
  local armed_stamp_file=${2:-}
  local active pinned_root pinned_sha

  if [[ -z "$armed_stamp_file" ]]; then
    armed_stamp_file="$(vps_vo5c_production_deploy_enforcement_armed_stamp_file)"
  fi

  _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0
  _VO5C_PRODUCTION_DEPLOY_AUTHORITY_PRESENT=0
  _VO5C_LOADED_PINNED_EXECUTOR_ROOT=''
  _VO5C_LOADED_PINNED_EXECUTOR_SHA=''

  if [[ -L "$authority_file" ]] && [[ ! -e "$authority_file" ]]; then
    vps_vo5c_log "ABORT: production_deploy_authority_dangling_symlink"
    return 1
  fi

  if [[ ! -e "$authority_file" ]]; then
    if [[ -f "$armed_stamp_file" ]]; then
      vps_vo5c_log "ABORT: production_deploy_authority_missing_after_armed"
      return 1
    fi
    return 0
  fi

  _VO5C_PRODUCTION_DEPLOY_AUTHORITY_PRESENT=1

  if [[ ! -r "$authority_file" ]] || [[ ! -f "$authority_file" ]]; then
    vps_vo5c_log "ABORT: production_deploy_authority_file_unreadable"
    return 1
  fi

  active=''
  pinned_root=''
  pinned_sha=''
  # shellcheck disable=SC1090
  if ! source "$authority_file"; then
    vps_vo5c_log "ABORT: production_deploy_authority_file_malformed"
    return 1
  fi

  active="${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE:-}"
  pinned_root="${SYNQDRIVE_PINNED_EXECUTOR_ROOT:-}"
  pinned_sha="${SYNQDRIVE_PINNED_EXECUTOR_SHA:-}"

  if [[ -z "$active" ]]; then
    vps_vo5c_log "ABORT: production_deploy_authority_missing_active_flag"
    return 1
  fi

  if ! vps_vo5c_validate_production_deploy_authority_payload "$active" "$pinned_root" "$pinned_sha"; then
    return 1
  fi

  if [[ "$active" == "1" ]]; then
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1
    _VO5C_LOADED_PINNED_EXECUTOR_ROOT="$pinned_root"
    _VO5C_LOADED_PINNED_EXECUTOR_SHA="$pinned_sha"
  fi

  return 0
}

vps_vo5c_load_production_deploy_authority() {
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED}" == "1" ]]; then
    return 0
  fi

  if ! vps_vo5c_load_production_deploy_authority_from_path "$(vps_vo5c_production_deploy_authority_file)"; then
    return 1
  fi

  _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
  return 0
}

vps_vo5c_require_production_deploy_authority_resolved() {
  vps_vo5c_load_production_deploy_authority
}

vps_vo5c_production_deploy_enforcement_active() {
  if ! vps_vo5c_load_production_deploy_authority; then
    return 2
  fi
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" == "1" ]]; then
    return 0
  fi
  return 1
}

vps_vo5c_realpath_or_pwd() {
  local path=$1
  if command -v realpath >/dev/null 2>&1; then
    realpath "$path" 2>/dev/null || printf '%s' "$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  else
    printf '%s' "$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  fi
}

vps_vo5c_assert_production_deploy_canonical_authority_after_load() {
  local executor_root=$1
  local requested_sha=$2
  local authority_file pinned_root pinned_sha
  local executor_root_real pinned_root_real canonical_deploy expected_deploy

  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" != "1" ]]; then
    return 0
  fi

  pinned_root="${_VO5C_LOADED_PINNED_EXECUTOR_ROOT:-}"
  pinned_sha="${_VO5C_LOADED_PINNED_EXECUTOR_SHA:-}"
  if [[ -z "$pinned_root" || -z "$pinned_sha" ]]; then
    vps_vo5c_log "ABORT: production_deploy_loaded_pins_missing"
    return 1
  fi

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

vps_vo5c_assert_production_deploy_canonical_authority() {
  if ! vps_vo5c_load_production_deploy_authority; then
    return 1
  fi
  vps_vo5c_assert_production_deploy_canonical_authority_after_load "$1" "$2"
}

vps_vo5c_assert_protected_deploy_entry_authority_after_load() {
  local entry_label=${1:-deploy_entry}
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" == "1" ]]; then
    vps_vo5c_log "ABORT: production_deploy_enforcement_blocks_entry entry=${entry_label}"
    return 1
  fi
  return 0
}

vps_vo5c_assert_protected_deploy_entry_authority() {
  local entry_label=${1:-deploy_entry}

  if ! vps_vo5c_load_production_deploy_authority; then
    vps_vo5c_log "ABORT: production_deploy_authority_unresolved entry=${entry_label}"
    return 1
  fi
  vps_vo5c_assert_protected_deploy_entry_authority_after_load "$entry_label"
}

vps_vo5c_assert_not_direct_deploy_when_enforcement_active() {
  local ops_dir=$1
  if ! vps_vo5c_load_production_deploy_authority; then
    return 1
  fi
  if [[ "${_VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" != "1" ]]; then
    return 0
  fi
  vps_vo5c_log "ABORT: production_deploy_must_use_vps_vo5c_run_pinned_security_deploy"
  return 1
}
