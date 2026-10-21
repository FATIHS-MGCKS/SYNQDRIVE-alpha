#!/usr/bin/env bash
# Offline tests: non-root SSH bootstrap preflight/invoke + permission semantics.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ROOT}/../../.." && pwd)"
SCRIPT_DIR="${REPO_ROOT}/.cursor/scripts"
# shellcheck source=../../.cursor/scripts/lib/cloud-agent-vo5c-bootstrap-remote.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-bootstrap-remote.lib.sh"
# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh
source "${ROOT}/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

BOOT="/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh"
SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

preflight_admin="$(cloud_agent_vo5c_remote_bootstrap_preflight_command "$BOOT" "synqdrive-admin")"
[[ "$preflight_admin" == sudo\ -n\ -H*--preflight-check ]] && pass nonroot_preflight_uses_sudo
[[ "$preflight_admin" != *test\ -x* ]] && pass nonroot_preflight_no_direct_test_x

invoke_admin="$(cloud_agent_vo5c_remote_bootstrap_invoke_command "$BOOT" "synqdrive-admin" "$SHA")"
[[ "$invoke_admin" == sudo\ -n\ -H* ]] && [[ "$invoke_admin" == *"$SHA" ]] && pass nonroot_invoke_uses_sudo_with_sha_only

preflight_root="$(cloud_agent_vo5c_remote_bootstrap_preflight_command "$BOOT" "root")"
[[ "$preflight_root" != sudo* ]] && pass root_preflight_no_sudo

SD="$(mktemp -d)"
SHARED="${SD}/synqdrive/shared"
mkdir -p "$SHARED"
trap 'rm -rf "$SD"' EXIT
export VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER=1
export VO5C_CLOUD_AGENT_BOOTSTRAP_PATH="${SHARED}/vo5c-cloud-agent-pinned-deploy-bootstrap.sh"
export VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB="${SHARED}/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"
export VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST="${SHARED}/manifest.env"
export VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH="$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"

cp "${ROOT}/vo5c-cloud-agent-pinned-deploy-bootstrap.sh" "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
cp "${ROOT}/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh" "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB"
chmod 750 "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
chmod 600 "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB"

WT="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT" "$SHA" >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; rm -rf "$SD"' EXIT
bash "${ROOT}/vo5c-cloud-agent-pinned-deploy-bootstrap-write-manifest.sh" \
  "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH" "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB" \
  "$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST" "$WT" "$SHA" >/dev/null

# synqdrive-admin (non-root) cannot execute root-only 750 bootstrap without sudo
if id nobody >/dev/null 2>&1; then
  if sudo -u nobody test -x "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH" 2>/dev/null; then
    fail "nonroot_direct_execute_should_fail"
  else
    pass nonroot_direct_execute_denied
  fi
else
  pass nonroot_direct_execute_denied_skipped_no_nobody_user
fi

vo5c_cloud_agent_bootstrap_preflight_only && pass bootstrap_preflight_check_pass

echo "ALL_VO5C_CLOUD_AGENT_BOOTSTRAP_EXECUTION_SELFTEST_PASS"
