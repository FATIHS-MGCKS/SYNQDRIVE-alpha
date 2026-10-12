#!/usr/bin/env bash
# DSRG — cloud-agent-deploy.sh contract (static + bash -n; no VPS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/.cursor/scripts/cloud-agent-deploy.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

bash -n "$SCRIPT" && pass "bash_n_cloud_agent_deploy"

if grep -q 'git fetch --depth 1 origin' "$SCRIPT" && grep -q 'vps-deploy-release.sh"' "$SCRIPT"; then
  fail "shallow_fetch_vps_deploy_release_still_present"
fi
pass "no_shallow_fetch_direct_deploy"

if grep -q 'SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1' "$SCRIPT" && ! grep -q 'never sets SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED' "$SCRIPT"; then
  if grep -Eq 'export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1|SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1.*cloud-agent' "$SCRIPT"; then
    fail "agent_must_not_export_vo5c_deploy_authorized"
  fi
fi
pass "no_agent_auto_vo5c_authorized_export"

grep -q 'vps-vo5c-run-pinned-security-deploy.sh' "$SCRIPT" || fail "missing_pinned_runner_delegate"
pass "delegates_pinned_runner"

grep -q 'exit 42' "$SCRIPT" || fail "missing_operator_auth_exit_42"
pass "operator_auth_fail_closed"

CONN="${ROOT}/backend/scripts/ops/vps-deploy-connectivity-staging.sh"
bash -n "$CONN"
if head -20 "$CONN" | grep -q 'SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW'; then
  pass "connectivity_staging_fail_closed_guard"
else
  fail "connectivity_staging_guard_missing"
fi

echo "ALL_CLOUD_AGENT_CONTRACT_TESTS_PASS"
