#!/usr/bin/env bash
# VO5C P4B15/R2/R3 — production deploy bypass enforcement (offline).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
CANONICAL_AUTHORITY_PATH='/opt/synqdrive/shared/vo5c-production-deploy-authority.env'
PINNED_DC30_SHA='dc30d2c91e458603c7d45ba2e25c1ca0a1d0c672'
PROD_TARGET_SHA='7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c'
PRE_FLOOR_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

WT_PINNED="$(mktemp -d)"
WT_ALT="$(mktemp -d)"
AUTH_DIR="$(mktemp -d)"
AUTH_FILE="${AUTH_DIR}/vo5c-production-deploy-authority.env"
ARMED_STAMP="${AUTH_DIR}/vo5c-production-deploy-enforcement-armed"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_PINNED" 2>/dev/null || rm -rf "$WT_PINNED"; git -C "$REPO_ROOT" worktree remove --force "$WT_ALT" 2>/dev/null || rm -rf "$WT_ALT"; rm -rf "$AUTH_DIR"' EXIT

git -C "$REPO_ROOT" worktree add --detach "$WT_PINNED" "$HEAD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_ALT" "$HEAD_SHA" >/dev/null
HEAD_SHA="$(git -C "$WT_PINNED" rev-parse HEAD)"

write_authority() {
  local active=$1
  local pinned_sha
  pinned_sha="$(git -C "$WT_PINNED" rev-parse HEAD)"
  cat >"$AUTH_FILE" <<EOF
VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=${active}
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PINNED}
SYNQDRIVE_PINNED_EXECUTOR_SHA=${pinned_sha}
EOF
}

run_load_authority_only() {
  local auth_file=${1:-$AUTH_FILE}
  local armed_stamp=${2:-/nonexistent-armed-stamp}
  bash -c "
    set -euo pipefail
    source '${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh'
    source '${SCRIPT_DIR}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh'
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=0
    vps_vo5c_load_production_deploy_authority_from_path '${auth_file}' '${armed_stamp}'
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
  "
}

run_deploy_guard() {
  local wt=$1
  local requested=$2
  local authorized=${3:-0}
  local auth_file=${4:-$AUTH_FILE}
  local armed_stamp=${5:-/nonexistent-armed-stamp}
  export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED="$authorized"
  bash -c "
    set -euo pipefail
    OPS='${wt}/backend/scripts/ops'
    ROOT='${wt}'
    REQUESTED_SHA='${requested}'
    source \"\${OPS}/lib/vps-vo5c-security-floor.lib.sh\"
    source '${SCRIPT_DIR}/lib/vps-vo5c-deploy-admission.lib.sh'
    source '${SCRIPT_DIR}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh'
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=0
    vps_vo5c_load_production_deploy_authority_from_path '${auth_file}' '${armed_stamp}'
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
    vps_vo5c_assert_production_deploy_canonical_authority_after_load \"\${ROOT}\" \"\${REQUESTED_SHA}\"
  "
}

run_protected_entry() {
  local label=$1
  local auth_file=${2:-$AUTH_FILE}
  local armed_stamp=${3:-/nonexistent-armed-stamp}
  bash -c "
    set -euo pipefail
    source '${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh'
    source '${SCRIPT_DIR}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh'
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=0
    vps_vo5c_load_production_deploy_authority_from_path '${auth_file}' '${armed_stamp}' || exit 1
    _VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_LOADED=1
    vps_vo5c_assert_protected_deploy_entry_authority_after_load '${label}'
  "
}

if grep -q 'SYNQDRIVE_VO5C_DEPLOY_SELFTEST' "${SCRIPT_DIR}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh"; then
  fail "production bypass lib must not reference caller-controlled selftest env"
fi
pass "PRODUCTION_LIB_NO_SELFTEST_ENV_BYPASS"

if bash -c "
  vps_vo5c_production_deploy_authority_file() { printf '%s' '/tmp/evil-authority.env'; }
  source '${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh'
  source '${SCRIPT_DIR}/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh'
  test \"\$(vps_vo5c_production_deploy_authority_file)\" = '${CANONICAL_AUTHORITY_PATH}'
"; then
  pass "BASH_FUNCTION_OVERRIDE_IGNORED"
else
  fail "predeclared Bash function must not override canonical authority path"
fi

write_authority 1
if run_deploy_guard "$WT_ALT" "$HEAD_SHA" 1 2>/dev/null; then
  fail "active enforcement must reject non-pinned executor root"
fi
pass "ACTIVE_ENFORCEMENT_REJECTS_LEGACY_EXECUTOR"

write_authority 0
if ! run_deploy_guard "$WT_ALT" "$HEAD_SHA" 0; then
  fail "inactive enforcement must not block alternate executor checkout"
fi
pass "INACTIVE_ENFORCEMENT_ALLOWS_ALTERNATE_EXECUTOR"

write_authority 1
if run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 0 2>/dev/null; then
  fail "active enforcement must require SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1"
fi
pass "ACTIVE_ENFORCEMENT_REJECTS_MISSING_HUMAN_AUTH"

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

echo "# tamper" >>"${WT_PINNED}/backend/scripts/ops/vps-deploy-release.sh"
if run_deploy_guard "$WT_PINNED" "$HEAD_SHA" 1 2>/dev/null; then
  fail "tampered executor must be rejected"
fi
git -C "$WT_PINNED" checkout -- backend/scripts/ops/vps-deploy-release.sh
pass "TAMPERED_EXECUTOR_REJECTED"

write_authority 1
if run_deploy_guard "$WT_PINNED" "$PRE_FLOOR_SHA" 1 2>/dev/null; then
  fail "pre-floor deploy target must be rejected"
fi
pass "PRE_SECURITY_FLOOR_TARGET_REJECTED"

echo 'VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=maybe' >"$AUTH_FILE"
if run_load_authority_only 2>/dev/null; then
  fail "malformed authority active flag must fail closed"
fi
pass "MALFORMED_AUTHORITY_FAIL_CLOSED"

write_authority 1
rm -f "$AUTH_FILE"
mkdir "$AUTH_FILE"
if run_load_authority_only 2>/dev/null; then
  rmdir "$AUTH_FILE"
  fail "unreadable authority file must fail closed"
fi
rmdir "$AUTH_FILE"
write_authority 1
pass "UNREADABLE_AUTHORITY_FAIL_CLOSED"

ln -sf /nonexistent-vo5c-authority-target "$AUTH_FILE"
if run_load_authority_only 2>/dev/null; then
  fail "dangling authority symlink must fail closed"
fi
rm -f "$AUTH_FILE"
write_authority 1
pass "AUTHORITY_DANGLING_SYMLINK_FAIL_CLOSED"

write_authority 1
rm -f "$AUTH_FILE"
touch "$ARMED_STAMP"
if run_load_authority_only "$AUTH_FILE" "$ARMED_STAMP" 2>/dev/null; then
  fail "missing authority after armed stamp must fail closed"
fi
rm -f "$ARMED_STAMP"
write_authority 1
pass "AUTHORITY_MISSING_AFTER_ARMED_FAIL_CLOSED"

write_authority 1
if run_protected_entry "vps-deploy-connectivity-staging" 2>/dev/null; then
  fail "connectivity staging must be blocked when enforcement active"
fi
pass "CONNECTIVITY_STAGING_BLOCKED_WHEN_ENFORCEMENT_ACTIVE"

write_authority 0
if ! run_protected_entry "vps-deploy-connectivity-staging"; then
  fail "connectivity staging must remain available when enforcement inactive"
fi
pass "CONNECTIVITY_STAGING_ALLOWED_WHEN_ENFORCEMENT_INACTIVE"

export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_PINNED"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$HEAD_SHA"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$HEAD_SHA"
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=0
if bash "${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh" 2>/dev/null; then
  fail "pinned runner must reject missing authorization"
fi
pass "PINNED_RUNNER_REJECTS_MISSING_AUTH"

RELEASE_OPS="${WT_PINNED}/backend/scripts/ops"
if ! bash -c "export SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR='${RELEASE_OPS}'; source '${RELEASE_OPS}/lib/vps-production-replica.lib.sh'; declare -F vps_replica_rollback" >/dev/null 2>&1; then
  fail "vps_replica_rollback must remain available"
fi
pass "RFRF_ROLLBACK_LIB_UNCHANGED"

if ! grep -q 'vps_vo5c_assert_production_deploy_canonical_authority' "${SCRIPT_DIR}/vps-deploy-release.sh"; then
  fail "vps-deploy-release.sh must wire bypass enforcement"
fi
pass "DEPLOY_SCRIPT_WIRED"

if git -C "$REPO_ROOT" cat-file -e "${PINNED_DC30_SHA}:backend/scripts/ops/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh" 2>/dev/null; then
  fail "dc30d2c should not yet contain P4B15 enforcement lib"
fi
pass "PINNED_DC30_PRE_P4B15_EXECUTOR_DOCUMENTED"

if git -C "$REPO_ROOT" merge-base --is-ancestor "$PINNED_DC30_SHA" "$PROD_TARGET_SHA" 2>/dev/null; then
  pass "PINNED_DC30_ANCESTOR_OF_PROD_TARGET_SHA"
else
  pass "PINNED_DC30_ANCESTOR_CHECK_SKIPPED"
fi

if git -C "$REPO_ROOT" cat-file -e "${PROD_TARGET_SHA}^{commit}" 2>/dev/null \
  && git -C "$WT_PINNED" merge-base --is-ancestor "$PINNED_DC30_SHA" "$PROD_TARGET_SHA" 2>/dev/null; then
  write_authority 1
  if ! run_deploy_guard "$WT_PINNED" "$PROD_TARGET_SHA" 1 2>/dev/null; then
    fail "pinned executor must admit newer production target SHA when ancestry includes security floor"
  fi
  pass "PINNED_EXECUTOR_WITH_NEWER_TARGET_COMPATIBLE"
else
  pass "PROD_TARGET_SHA_COMPAT_CHECK_SKIPPED"
fi

bash "${SCRIPT_DIR}/vps-vo5c-pinned-deploy-execution-contract.selftest.sh"
pass "PINNED_DEPLOY_EXECUTION_CONTRACT"

echo "VO5C_P4B15_SELFTEST_SUMMARY=PASS"
