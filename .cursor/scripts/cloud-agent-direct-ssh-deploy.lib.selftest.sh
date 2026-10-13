#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/cloud-agent-direct-ssh-deploy.lib.sh
source "${ROOT}/.cursor/scripts/lib/cloud-agent-direct-ssh-deploy.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

cloud_agent_direct_ssh_validate_deploy_script_path '/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh' || fail 'valid_path'
pass valid_deploy_script_path

cloud_agent_direct_ssh_validate_deploy_script_path '/tmp/vps-deploy-release.sh' && fail 'reject_outside_opt'
pass reject_outside_opt

cloud_agent_direct_ssh_validate_deploy_script_path '/opt/synqdrive/evil.sh' && fail 'reject_wrong_name'
pass reject_wrong_suffix

cmd="$(cloud_agent_direct_ssh_remote_invoke_command '/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh' '0123456789abcdef0123456789abcdef01234567')"
echo "$cmd" | grep -q 'SYNQDRIVE_REQUESTED_DEPLOY_SHA=' || fail 'invoke_exports_sha'
echo "$cmd" | grep -q 'vps-deploy-release.sh' || fail 'invoke_calls_script'
pass remote_invoke_command_shape_root

cmd_admin="$(cloud_agent_direct_ssh_remote_invoke_command '/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh' '0123456789abcdef0123456789abcdef01234567' 'synqdrive-admin')"
echo "$cmd_admin" | grep -q 'sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA=' || fail 'invoke_sudo_env_for_admin'
echo "$cmd_admin" | grep -q 'bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh' || fail 'invoke_pinned_release_script'
echo "$cmd_admin" | grep -q 'bash -lc' && fail 'invoke_must_not_use_login_shell'
pass remote_invoke_command_shape_admin

echo "ALL_DIRECT_SSH_LIB_SELFTEST_PASS"
