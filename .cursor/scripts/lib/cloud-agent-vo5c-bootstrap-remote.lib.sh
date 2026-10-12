#!/usr/bin/env bash
# Build least-privilege remote bootstrap commands (synqdrive-admin uses sudo -n only).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

CLOUD_AGENT_VO5C_BOOTSTRAP_PREFLIGHT_FLAG="--preflight-check"
CLOUD_AGENT_REMOTE_EXIT_SUDO_DENIED=48

cloud_agent_vo5c_ssh_user_requires_sudo() {
  [[ "${1:-}" != "root" ]]
}

cloud_agent_vo5c_remote_bootstrap_preflight_command() {
  local bootstrap_path=$1
  local ssh_user=$2
  local q_boot
  q_boot="$(printf '%q' "$bootstrap_path")"
  if cloud_agent_vo5c_ssh_user_requires_sudo "$ssh_user"; then
    printf 'sudo -n -H %s %s' "$q_boot" "$CLOUD_AGENT_VO5C_BOOTSTRAP_PREFLIGHT_FLAG"
  else
    printf '%s %s' "$q_boot" "$CLOUD_AGENT_VO5C_BOOTSTRAP_PREFLIGHT_FLAG"
  fi
}

cloud_agent_vo5c_remote_bootstrap_invoke_command() {
  local bootstrap_path=$1
  local ssh_user=$2
  local requested_sha=$3
  local q_boot q_sha
  q_boot="$(printf '%q' "$bootstrap_path")"
  q_sha="$(printf '%q' "$requested_sha")"
  if cloud_agent_vo5c_ssh_user_requires_sudo "$ssh_user"; then
    printf 'sudo -n -H %s %s' "$q_boot" "$q_sha"
  else
    printf '%s %s' "$q_boot" "$q_sha"
  fi
}
