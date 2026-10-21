#!/usr/bin/env bash
# Direct SSH production deploy contract (cloud-agent-deploy.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/.cursor/scripts/cloud-agent-deploy.sh"
LIB="${ROOT}/.cursor/scripts/lib/cloud-agent-direct-ssh-deploy.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

bash -n "$SCRIPT" && pass "bash_n_cloud_agent_deploy"
bash -n "$LIB" && pass "bash_n_direct_ssh_lib"

if grep -q 'git fetch --depth 1 origin.*vps-deploy-release' "$SCRIPT"; then
  fail "shallow_fetch_direct_deploy_still_present"
fi
pass "no_shallow_fetch_from_agent"

if grep -Eq '^\s*export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1' "$SCRIPT"; then
  fail "agent_exports_vo5c_authorized"
fi
pass "no_vo5c_authorized_export"

if grep -q 'vo5c-cloud-agent-pinned-deploy-bootstrap' "$SCRIPT"; then
  fail "bootstrap_still_required_in_deploy_script"
fi
pass "no_mandatory_vo5c_bootstrap"

grep -q 'CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED' "$SCRIPT" || fail "missing_owner_deploy_ack"
grep -q 'vps-deploy-release.sh' "$SCRIPT" || fail "missing_vps_deploy_release_invoke"
grep -q 'deploy-ci-gate.mjs' "$SCRIPT" || fail "missing_ci_gate"
grep -q 'CLOUD_AGENT_SKIP_CI_GATE' "$SCRIPT" && fail "ci_gate_bypass_still_present"
pass "direct_ssh_contract_wired"

grep -q 'sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA=' "$LIB" || fail "missing_least_privilege_sudo_env_invoke"
if grep -q 'bash -lc' "$LIB"; then
  fail "login_shell_sudo_still_present"
fi
pass "sudo_invokes_validated_release_script_only"

if grep -q 'ssh-keyscan' "$SCRIPT"; then
  fail "deploy_script_still_uses_blind_keyscan"
fi
pass "no_blind_ssh_keyscan_in_deploy"

grep -q 'cloud_agent_ssh_auth_preflight' "$SCRIPT" || fail "missing_ssh_auth_preflight"
pass "ssh_auth_preflight_wired"

CONN="${ROOT}/backend/scripts/ops/vps-deploy-connectivity-staging.sh"
bash -n "$CONN"
head -20 "$CONN" | grep -q 'SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW' || fail "connectivity_guard_missing"
pass "connectivity_staging_fail_closed_guard"

bash "${ROOT}/.cursor/scripts/cloud-agent-deploy.outcome.selftest.sh"
bash "${ROOT}/.cursor/scripts/cloud-agent-direct-ssh-deploy.lib.selftest.sh"
node "${ROOT}/backend/scripts/ops/deploy-ci-gate.selftest.mjs"

echo "ALL_CLOUD_AGENT_CONTRACT_TESTS_PASS"
