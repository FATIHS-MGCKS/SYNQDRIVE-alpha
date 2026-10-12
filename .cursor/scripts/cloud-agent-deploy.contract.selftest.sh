#!/usr/bin/env bash
# DSRG — cloud-agent-deploy.sh contract (bash -n + delegates to executable remote selftest).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/.cursor/scripts/cloud-agent-deploy.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

bash -n "$SCRIPT" && pass "bash_n_cloud_agent_deploy"
bash -n "${ROOT}/.cursor/scripts/cloud-agent-vo5c-remote-pinned-deploy.sh"

if grep -q 'git fetch --depth 1 origin.*vps-deploy-release' "$SCRIPT"; then
  fail "shallow_fetch_direct_deploy_still_present"
fi
pass "no_shallow_fetch_direct_deploy"

if grep -Eq '^\s*export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1' "$SCRIPT"; then
  fail "agent_exports_vo5c_authorized"
fi
pass "no_agent_auto_vo5c_authorized_export"

grep -q 'tar -C' "$SCRIPT" && grep -q 'cloud-agent-vo5c-remote-pinned-deploy.sh' "$SCRIPT" || fail "missing_tar_pinned_delegate"
pass "delegates_pinned_runner_via_tar"

grep -q 'exit 42' "$SCRIPT" || fail "missing_operator_auth_exit_42"
pass "operator_auth_fail_closed"

if grep -A20 'cloud_agent_vo5c_resolve_human_authorization' "${ROOT}/.cursor/scripts/lib/cloud-agent-vo5c-remote-pinned-deploy.lib.sh" | grep -q 'SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED:-'; then
  fail "cloud_agent_delegate_still_has_shell_env_fallback"
fi
pass "cloud_agent_session_file_only_authorization"

grep -q 'enforcement active — legacy shallow-fetch' "$SCRIPT" && fail "legacy_enforcement_block_on_pinned"
pass "no_legacy_only_enforcement_abort_in_wrapper"

CONN="${ROOT}/backend/scripts/ops/vps-deploy-connectivity-staging.sh"
bash -n "$CONN"
head -20 "$CONN" | grep -q 'SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW' || fail "connectivity_guard_missing"
pass "connectivity_staging_fail_closed_guard"

bash "${ROOT}/.cursor/scripts/cloud-agent-vo5c-remote-pinned-deploy.selftest.sh"
bash "${ROOT}/.cursor/scripts/cloud-agent-deploy.outcome.selftest.sh"

echo "ALL_CLOUD_AGENT_CONTRACT_TESTS_PASS"
