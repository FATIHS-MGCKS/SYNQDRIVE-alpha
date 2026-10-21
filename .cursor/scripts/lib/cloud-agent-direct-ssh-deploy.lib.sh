#!/usr/bin/env bash
# Canonical Cloud Agent → VPS direct SSH production release (vps-deploy-release.sh).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

CLOUD_AGENT_DEFAULT_VPS_DEPLOY_SCRIPT='/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh'
CLOUD_AGENT_REMOTE_EXIT_DEPLOY_SCRIPT_MISSING=46
CLOUD_AGENT_REMOTE_EXIT_OWNER_DEPLOY_NOT_AUTHORIZED=41

cloud_agent_direct_ssh_shared_root() {
  printf '%s' '/opt/synqdrive'
}

cloud_agent_direct_ssh_validate_deploy_script_path() {
  local path=$1
  [[ -n "$path" ]] || return 1
  [[ "$path" == /* ]] || return 1
  [[ "$path" != *$'\n'* ]] || return 1
  case "$path" in
    *';'*|*'|'*|*'`'*|*'$('*|*'>'*|*'<'*|*'&'*|*'('*|*')'*|*'#'*|*'!'*) return 1 ;;
  esac
  [[ "$path" == */backend/scripts/ops/vps-deploy-release.sh ]] || return 1
  local root prefix
  root="$(cloud_agent_direct_ssh_shared_root)"
  prefix="${root}/"
  if [[ "$path" != "$root" && "$path" != "${prefix}"* ]]; then
    return 1
  fi
  if ! command -v realpath >/dev/null 2>&1; then
    echo "ABORT: realpath required for deploy script path validation" >&2
    return 1
  fi
  local canon
  canon="$(realpath -m "$path")"
  if [[ "$canon" != "$root" && "$canon" != "${prefix}"* ]]; then
    return 1
  fi
  return 0
}

cloud_agent_direct_ssh_remote_preflight_command() {
  local deploy_script=$1
  local q_script
  q_script="$(printf '%q' "$deploy_script")"
  printf 'test -f %s && echo DEPLOY_SCRIPT_OK || echo DEPLOY_SCRIPT_MISSING' "$q_script"
}

cloud_agent_direct_ssh_remote_invoke_command() {
  local deploy_script=$1
  local requested_sha=$2
  local ssh_user=${3:-root}
  local q_script q_sha inner
  q_script="$(printf '%q' "$deploy_script")"
  q_sha="$(printf '%q' "$requested_sha")"
  # Non-root login (Hostinger synqdrive-admin): elevate only to run the validated release script.
  # Uses `env` + `bash <pinned path>` — no login shell (`-lc`) and no new sudoers entries in-repo.
  if [[ "$ssh_user" != "root" ]]; then
    printf 'sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA=%s bash %s' "$q_sha" "$q_script"
  else
    printf 'env SYNQDRIVE_REQUESTED_DEPLOY_SHA=%s bash %s' "$q_sha" "$q_script"
  fi
}
