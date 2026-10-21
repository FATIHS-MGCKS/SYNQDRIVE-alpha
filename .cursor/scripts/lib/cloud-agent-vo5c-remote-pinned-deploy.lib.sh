#!/usr/bin/env bash
# VPS-side pinned deploy delegate (sourced by cloud-agent-vo5c-remote-pinned-deploy.sh).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_LIB_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SESSION_LIB="${REMOTE_LIB_DIR:-${_LIB_SELF}}/cloud-agent-vo5c-operator-session.lib.sh"
# shellcheck source=cloud-agent-vo5c-operator-session.lib.sh
source "${_SESSION_LIB}"

CLOUD_AGENT_REMOTE_EXIT_MISSING_AUTH=42
CLOUD_AGENT_REMOTE_EXIT_LEGACY_BYPASS=43

cloud_agent_vo5c_load_authority_state() {
  local auth_file=$1
  local armed_stamp=$2
  CLOUD_AGENT_VO5C_ENFORCEMENT_ACTIVE=0
  CLOUD_AGENT_VO5C_AUTHORITY_OK=1

  if [[ -L "$auth_file" ]] && [[ ! -e "$auth_file" ]]; then
    echo "ABORT: VO5C production deploy authority dangling symlink" >&2
    CLOUD_AGENT_VO5C_AUTHORITY_OK=0
    return 1
  fi
  if [[ ! -e "$auth_file" ]]; then
    if [[ -f "$armed_stamp" ]]; then
      echo "ABORT: VO5C production deploy authority missing after armed stamp" >&2
      CLOUD_AGENT_VO5C_AUTHORITY_OK=0
      return 1
    fi
    return 0
  fi
  if [[ ! -r "$auth_file" ]] || [[ ! -f "$auth_file" ]]; then
    echo "ABORT: VO5C production deploy authority file unreadable" >&2
    CLOUD_AGENT_VO5C_AUTHORITY_OK=0
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  if ! source "$auth_file"; then
    set +a
    echo "ABORT: VO5C production deploy authority file malformed" >&2
    CLOUD_AGENT_VO5C_AUTHORITY_OK=0
    return 1
  fi
  set +a
  case "${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE:-}" in
    0) CLOUD_AGENT_VO5C_ENFORCEMENT_ACTIVE=0 ;;
    1) CLOUD_AGENT_VO5C_ENFORCEMENT_ACTIVE=1 ;;
    *)
      echo "ABORT: VO5C production deploy authority invalid active flag" >&2
      CLOUD_AGENT_VO5C_AUTHORITY_OK=0
      return 1
      ;;
  esac
  return 0
}

# When enforcement is ON, only pinned-runner entry is allowed (this function). Legacy shallow-fetch must abort elsewhere.
cloud_agent_vo5c_assert_pinned_entry_allowed() {
  if [[ "${CLOUD_AGENT_VO5C_ENFORCEMENT_ACTIVE:-0}" == "1" ]]; then
    echo "INFO: VO5C production deploy enforcement ACTIVE — pinned runner entry required (legacy bypass blocked)"
  fi
  return 0
}

cloud_agent_vo5c_prepare_staged_release_checkout() {
  local staged_root=$1
  local requested_sha=$2
  if [[ -z "$staged_root" ]]; then
    return 0
  fi
  local staged_canon
  if ! staged_canon="$(cloud_agent_vo5c_canonical_shared_path "$staged_root")"; then
    echo "ABORT: invalid SYNQDRIVE_STAGED_RELEASE_ROOT" >&2
    return 1
  fi
  mkdir -p "$staged_canon"
  if [[ ! -d "${staged_canon}/.git" ]]; then
    git init -q "$staged_canon"
    git -C "$staged_canon" remote add origin "${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}" 2>/dev/null \
      || git -C "$staged_canon" remote set-url origin "${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
  fi
  if ! git -C "$staged_canon" fetch --depth 1 origin "$requested_sha"; then
    echo "ABORT: staged release fetch failed for ${requested_sha}" >&2
    return 1
  fi
  if ! git -C "$staged_canon" checkout -q FETCH_HEAD; then
    echo "ABORT: staged release checkout failed" >&2
    return 1
  fi
  local actual
  actual="$(git -C "$staged_canon" rev-parse HEAD)"
  actual="$(cloud_agent_vo5c_normalize_sha "$actual")"
  if [[ "$actual" != "$(cloud_agent_vo5c_normalize_sha "$requested_sha")" ]]; then
    echo "ABORT: staged release HEAD ${actual} != requested ${requested_sha}" >&2
    return 1
  fi
  export SYNQDRIVE_STAGED_RELEASE_ROOT="$staged_canon"
  return 0
}

# Cloud Agent / tar-stream delegate: operator session file only (no shell env fallback).
# Manual VPS pinned-runner invocation may still export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 directly.
cloud_agent_vo5c_resolve_human_authorization() {
  local session_file=$1
  local requested_sha=$2

  if [[ ! -f "$session_file" ]]; then
    return 1
  fi
  if ! cloud_agent_vo5c_parse_operator_session_file "$session_file" "$requested_sha"; then
    return 1
  fi
  export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
  return 0
}

cloud_agent_vo5c_run_remote_pinned_deploy() {
  local requested_sha=$1
  local pin_env_file=$2
  local session_file=$3
  local auth_file=${4:-/opt/synqdrive/shared/vo5c-production-deploy-authority.env}
  local armed_stamp=${5:-/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed}
  local staged_root=${6:-}

  if ! cloud_agent_vo5c_is_full_sha "$requested_sha"; then
    echo "ABORT: invalid REQUESTED_DEPLOY_SHA" >&2
    return 1
  fi
  if ! cloud_agent_vo5c_validate_shared_path "$pin_env_file"; then
    echo "ABORT: invalid pin env path" >&2
    return 1
  fi
  if ! cloud_agent_vo5c_validate_shared_path "$session_file"; then
    echo "ABORT: invalid operator session path" >&2
    return 1
  fi
  if ! cloud_agent_vo5c_validate_shared_path "$auth_file"; then
    echo "ABORT: invalid authority path" >&2
    return 1
  fi

  if ! cloud_agent_vo5c_load_authority_state "$auth_file" "$armed_stamp"; then
    return 1
  fi
  cloud_agent_vo5c_assert_pinned_entry_allowed || return 1

  if [[ ! -f "$pin_env_file" ]]; then
    echo "ABORT: missing pin env ${pin_env_file}" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$pin_env_file"
  set +a

  export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$(cloud_agent_vo5c_normalize_sha "$requested_sha")"

  if ! cloud_agent_vo5c_resolve_human_authorization "$session_file" "$requested_sha"; then
    echo "ABORT: operator deploy session file missing or invalid (Cloud Agent requires VPS session file)" >&2
    return "$CLOUD_AGENT_REMOTE_EXIT_MISSING_AUTH"
  fi

  if [[ -n "$staged_root" ]]; then
    if ! cloud_agent_vo5c_prepare_staged_release_checkout "$staged_root" "$requested_sha"; then
      return 1
    fi
  fi

  local pinned_ops="${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
  if [[ ! -f "${pinned_ops}/vps-vo5c-run-pinned-security-deploy.sh" ]]; then
    echo "ABORT: pinned runner missing under ${pinned_ops}" >&2
    return 1
  fi

  if declare -F cloud_agent_vo5c_invoke_pinned_runner_hook >/dev/null 2>&1; then
    cloud_agent_vo5c_invoke_pinned_runner_hook "$pinned_ops"
    return $?
  fi

  cd "$pinned_ops"
  exec bash "${pinned_ops}/vps-vo5c-run-pinned-security-deploy.sh"
}
