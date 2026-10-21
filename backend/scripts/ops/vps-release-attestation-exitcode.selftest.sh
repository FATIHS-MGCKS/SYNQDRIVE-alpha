#!/usr/bin/env bash
# P4B16 R1B — caller exit-code propagation (offline; no production paths).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=lib/vps-release-attestation-integration.lib.sh
source "${LIB_DIR}/vps-release-attestation-integration.lib.sh"

# Bash: $? inside `if ! cmd` is the if-test status (0), not cmd's rc — regression guard.
simulate_bad_if_capture() {
  false
  local captured=$?
  [[ "$captured" -eq 0 ]] && return 0
  return 1
}

simulate_good_set_e_capture() {
  set +e
  false
  local captured=$?
  set -e
  [[ "$captured" -eq 1 ]] && return 0
  return 1
}

simulate_good_set_e_capture || fail "set_e_capture_pattern"
pass "bash_status_not_from_if_negation"
simulate_bad_if_capture && fail "if_negation_poisoned_dollar_question"

vps_p4b16_is_partial_success_rc 3 && pass "partial_rc3_detected"
vps_p4b16_is_partial_success_rc 1 && fail "partial_rc1_false_positive"
vps_p4b16_rollback_runtime_ok 0 && pass "rollback_ok_rc0"
vps_p4b16_rollback_runtime_ok 3 && pass "rollback_ok_rc3"
if vps_p4b16_rollback_runtime_ok 1; then
  fail "rollback_ok_rc1"
fi
pass "rollback_fail_rc1"

# Deploy hook pattern: set +e around publish captures RC 3 on lock failure (mocked).
OPS="$(mktemp -d)"
ROOT="$(mktemp -d)"
mkdir -p "${OPS}/lib" "${ROOT}/deploy-state"
cp "${LIB_DIR}/vps-release-attestation-integration.lib.sh" "${OPS}/lib/"
cp "${LIB_DIR}/vps-release-attestation.lib.sh" "${OPS}/lib/"
cp "${LIB_DIR}/vps-release-attestation-env-mirror.lib.sh" "${OPS}/lib/"
export VPS_ATTESTATION_STATE_DIR="${ROOT}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT}/backend.env"
touch "${VPS_ATTESTATION_BACKEND_ENV}"

SHA_A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
REL_DIR="/tmp/p4b16-exitcode-fixture"
vps_replica_verify_post_deploy() { return 0; }

# shellcheck source=lib/vps-release-attestation-integration.lib.sh
source "${OPS}/lib/vps-release-attestation-integration.lib.sh"

set +e
vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_A"
_deploy_rc=$?
set -e
[[ "$_deploy_rc" -eq 0 ]] || fail "deploy_publish_success_rc"

(
  vps_attest_lock_acquire
  sleep 3
  vps_attest_lock_release
) &
sleep 0.3
set +e
vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_A" >/dev/null
_lock_rc=$?
set -e
wait || true
[[ "$_lock_rc" -eq 3 ]] || fail "deploy_partial_lock_rc3_got_${_lock_rc}"
pass "deploy_hook_rc3_propagation"

# Missing core lib with integration shell present → RC 3
OPS_BROKEN="$(mktemp -d)"
mkdir -p "${OPS_BROKEN}/lib"
cp "${LIB_DIR}/vps-release-attestation-integration.lib.sh" "${OPS_BROKEN}/lib/"
set +e
vps_p4b16_publish_after_deploy_verify "$OPS_BROKEN" "$REL_DIR" "$SHA_A" >/dev/null
_missing_rc=$?
set -e
[[ "$_missing_rc" -eq 3 ]] || fail "missing_core_lib_rc3_got_${_missing_rc}"
pass "missing_core_library_rc3"

# Manual rollback script classification (subshell mimics vps-rollback-production-release.sh tail).
export SCRIPT_DIR="$SCRIPT_DIR"
rollback_script_classify() {
  local rc=$1
  if [[ "$rc" -eq 0 ]]; then
    return 0
  fi
  if [[ -f "${SCRIPT_DIR}/lib/vps-release-attestation-integration.lib.sh" ]]; then
    # shellcheck source=lib/vps-release-attestation-integration.lib.sh
    source "${SCRIPT_DIR}/lib/vps-release-attestation-integration.lib.sh"
    if vps_p4b16_is_partial_success_rc "$rc"; then
      return 3
    fi
  elif [[ "$rc" -eq 3 ]]; then
    return 3
  fi
  return 1
}

set +e
rollback_script_classify 3
_cls=$?
set -e
[[ "$_cls" -eq 3 ]] || fail "manual_rollback_classify_rc3"
pass "manual_rollback_rc3_not_failed"

set +e
rollback_script_classify 1
_cls_fail=$?
set -e
[[ "$_cls_fail" -eq 1 ]] || fail "manual_rollback_classify_rc1"
pass "manual_rollback_rc1_still_failed"

# Auto-rollback containment: RC 3 must not trigger physical-failure containment branch.
_contain=0
_P4B16_RB_RC=3
if [[ -f "${LIB_DIR}/vps-release-attestation-integration.lib.sh" ]]; then
  source "${LIB_DIR}/vps-release-attestation-integration.lib.sh"
  if vps_p4b16_is_partial_success_rc "$_P4B16_RB_RC"; then
    : # replicas OK
  elif ! vps_p4b16_rollback_runtime_ok "$_P4B16_RB_RC"; then
    _contain=1
  fi
elif [[ "$_P4B16_RB_RC" -ne 0 ]]; then
  _contain=1
fi
[[ "$_contain" -eq 0 ]] || fail "auto_rollback_rc3_triggered_containment"
pass "auto_rollback_rc3_no_containment"

_P4B16_RB_RC=1
_contain=0
if vps_p4b16_is_partial_success_rc "$_P4B16_RB_RC"; then
  :
elif ! vps_p4b16_rollback_runtime_ok "$_P4B16_RB_RC"; then
  _contain=1
fi
[[ "$_contain" -eq 1 ]] || fail "auto_rollback_rc1_should_contain"
pass "auto_rollback_rc1_containment"

rm -rf "$OPS" "$ROOT" "$OPS_BROKEN"
echo "ALL_EXITCODE_TESTS_PASS"
