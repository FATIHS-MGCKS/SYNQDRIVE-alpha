#!/usr/bin/env bash
# VO5C P4B15 — production deploy bypass enforcement (offline).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
PRE_FLOOR_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

export SYNQDRIVE_VO5C_DEPLOY_SELFTEST=1

WT_PINNED="$(mktemp -d)"
WT_ALT="$(mktemp -d)"
AUTH_DIR="$(mktemp -d)"
AUTH_FILE="${AUTH_DIR}/vo5c-production-deploy-authority.env"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_PINNED" 2>/dev/null || rm -rf "$WT_PINNED"; git -C "$REPO_ROOT" worktree remove --force "$WT_ALT" 2>/dev/null || rm -rf "$WT_ALT"; rm -rf "$AUTH_DIR"' EXIT

git -C "$REPO_ROOT" worktree add --detach "$WT_PINNED" "$HEAD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_ALT" "$HEAD_SHA" >/dev/null

write_authority() {
  local active=$1
  cat >"$AUTH_FILE" <<EOF
VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=${active}
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PINNED}
SYNQDRIVE_PINNED_EXECUTOR_SHA=${HEAD_SHA}
EOF
}

run_deploy_guard() {
  local wt=$1
  local requested=$2
  local authorized=${3:-0}
  export SYNQDRIVE_VO5C_PRODUCTION_DEPLOY_AUTHORITY_FILE="$AUTH_FILE"
  export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED="$authorized"
  export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$requested"
  bash -c "
    set -euo pipefail
    OPS='${wt}/backend/scripts/ops'
    ROOT='${wt}'
    REQUESTED_SHA='${requested}'
    source \"\${OPS}/lib/vps-vo5c-security-floor.lib.sh\"
    source \"\${OPS}/lib/vps-vo5c-deploy-admission.lib.sh\"
    source \"\${OPS}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh\"
    vps_vo5c_assert_production_deploy_canonical_authority \"\${ROOT}\" \"\${REQUESTED_SHA}\"
  "
}

# Inactive authority — non-pinned checkout path allowed
write_authority 0
if ! run_deploy_guard "$WT_ALT" "$HEAD_SHA" 0; then
  fail "inactive enforcement must not block alternate executor checkout"
fi
pass "INACTIVE_ENFORCEMENT_ALLOWS_ALTERNATE_EXECUTOR"

# Active — non-pinned executor root rejected (simulates /opt/synqdrive/current bypass)
write_authority 1
if run_deploy_guard "$WT_ALT" "$HEAD_SHA" 1 2>/dev/null; then
  fail "active enforcement must reject non-pinned executor root"
fi
pass "ACTIVE_ENFORCEMENT_REJECTS_LEGACY_EXECUTOR"

# Active — missing human authorization
if run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 0 2>/dev/null; then
  fail "active enforcement must require SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1"
fi
pass "ACTIVE_ENFORCEMENT_REJECTS_MISSING_HUMAN_AUTH"

# Active — wrong pinned SHA in authority file
cat >"$AUTH_FILE" <<EOF
VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PINNED}
SYNQDRIVE_PINNED_EXECUTOR_SHA=0000000000000000000000000000000000000000
EOF
if run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 1 2>/dev/null; then
  fail "unsupported executor SHA must be rejected"
fi
pass "ACTIVE_ENFORCEMENT_REJECTS_WRONG_PINNED_SHA"

write_authority 1
if ! run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 1; then
  fail "pinned executor with human auth must pass"
fi
pass "PINNED_INVOCATION_CAN_SUCCEED"

# Tampered executor tree
echo "# tamper" >>"${WT_PINNED}/backend/scripts/ops/vps-deploy-release.sh"
if run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 1 2>/dev/null; then
  fail "tampered executor must be rejected"
fi
git -C "$WT_PINNED" checkout -- backend/scripts/ops/vps-deploy-release.sh
pass "TAMPERED_EXECUTOR_REJECTED"

# Pre-security-floor target rejected when enforcement active
if run_deploy_guard "$WT_PINNED" "$PRE_FLOOR_SHA" 1 2>/dev/null; then
  fail "pre-floor deploy target must be rejected"
fi
pass "PRE_SECURITY_FLOOR_TARGET_REJECTED"

# Pinned runner requires human auth (existing contract)
export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_PINNED"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$HEAD_SHA"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$HEAD_SHA"
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=0
if bash "${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh" 2>/dev/null; then
  fail "pinned runner must reject missing authorization"
fi
pass "PINNED_RUNNER_REJECTS_MISSING_AUTH"

# RFRF / rollback libs still expose guard (non-interference)
RELEASE_OPS="${WT_PINNED}/backend/scripts/ops"
if ! bash -c "export SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR='${RELEASE_OPS}'; source '${RELEASE_OPS}/lib/vps-production-replica.lib.sh'; declare -F vps_replica_rollback" >/dev/null 2>&1; then
  fail "vps_replica_rollback must remain available"
fi
pass "RFRF_ROLLBACK_LIB_UNCHANGED"

if ! grep -q 'vps_vo5c_assert_production_deploy_canonical_authority' "${SCRIPT_DIR}/vps-deploy-release.sh"; then
  fail "vps-deploy-release.sh must wire bypass enforcement"
fi
pass "DEPLOY_SCRIPT_WIRED"

echo "VO5C_P4B15_SELFTEST_SUMMARY=PASS"
