#!/usr/bin/env bash
# DSRG — cloud-agent-deploy.sh contract (bash -n + delegates to executable remote selftest).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/.cursor/scripts/cloud-agent-deploy.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

bash -n "$SCRIPT" && pass "bash_n_cloud_agent_deploy"
bash -n "${ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap.sh"

if grep -q 'git fetch --depth 1 origin.*vps-deploy-release' "$SCRIPT"; then
  fail "shallow_fetch_direct_deploy_still_present"
fi
pass "no_shallow_fetch_direct_deploy"

if grep -Eq '^\s*export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1' "$SCRIPT"; then
  fail "agent_exports_vo5c_authorized"
fi
pass "no_agent_auto_vo5c_authorized_export"

if grep -q 'tar -C' "$SCRIPT" || grep -q 'tar -xzf' "$SCRIPT"; then
  fail "tar_stream_delegate_still_present"
fi
pass "cloud_agent_tar_stream_removed"

grep -q 'CLOUD_AGENT_VO5C_BOOTSTRAP_PATH' "$SCRIPT" || fail "missing_fixed_bootstrap_invoke"
grep -q 'fixed VPS bootstrap' "$SCRIPT" || fail "missing_fixed_bootstrap_invoke"
grep -q 'CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_MISSING' "$SCRIPT" || fail "missing_bootstrap_missing_exit_44"
pass "invokes_fixed_vps_bootstrap_only"

if grep -q 'ssh-keyscan' "$SCRIPT"; then
  fail "deploy_script_still_uses_blind_keyscan"
fi
pass "no_blind_ssh_keyscan_in_deploy"

grep -q 'cloud_agent_ssh_auth_preflight' "$SCRIPT" || fail "missing_ssh_auth_preflight"
pass "ssh_auth_preflight_wired"

grep -q 'exit 42' "$SCRIPT" || fail "missing_operator_auth_exit_42"
pass "operator_auth_fail_closed"

if grep -A15 'vo5c_cloud_agent_resolve_session_authorization' "${ROOT}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh" | grep -q 'SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED:-'; then
  fail "cloud_agent_delegate_still_has_shell_env_fallback"
fi
pass "cloud_agent_session_file_only_authorization"

grep -q 'enforcement active — legacy shallow-fetch' "$SCRIPT" && fail "legacy_enforcement_block_on_pinned"
pass "no_legacy_only_enforcement_abort_in_wrapper"

CONN="${ROOT}/backend/scripts/ops/vps-deploy-connectivity-staging.sh"
bash -n "$CONN"
head -20 "$CONN" | grep -q 'SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW' || fail "connectivity_guard_missing"
pass "connectivity_staging_fail_closed_guard"

bash "${ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap.selftest.sh"
bash "${ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap-execution.selftest.sh"
bash "${ROOT}/.cursor/scripts/cloud-agent-deploy.outcome.selftest.sh"

echo "ALL_CLOUD_AGENT_CONTRACT_TESTS_PASS"
