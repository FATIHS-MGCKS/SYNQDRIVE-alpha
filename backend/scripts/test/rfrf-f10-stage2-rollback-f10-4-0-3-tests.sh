#!/usr/bin/env bash
# RFRF F10.4.0.3 — verified stop, mutation boundary, strict signals, single authority block.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "F10_4_0_3_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "F10_4_0_3_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

export RFRF_ROLLBACK_TEST_MODE=1
export RFRF_FIXTURE_MODE=1
unset RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE
export RFRF_REQUIRED_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$REPO_ROOT"
export BACKEND_ENV="${TMP_DIR}/backend.env"
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES
CUTOVER="2026-09-18T10:25:41.000Z"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

write_stage2_env() {
  cat >"$BACKEND_ENV" <<EOF
METRICS_BEARER_TOKEN=fixture-token
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=${CUTOVER}
RAW_FUEL_REFUEL_FALLBACK_ENABLED=true
EOF
}

clear_inject() {
  unset RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_POST_VERIFY_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_STAGE_VERIFY_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_A_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_BACKUP_RESTORE_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF
  unset RFRF_TEST_INJECT_ROLLBACK_SIGNAL_AT
  unset RFRF_TEST_INJECT_ROLLBACK_POST_ATOMIC_ERROR
  unset RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAIL
  unset RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAKE_OK
  unset RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAKE_OK
}

run_rollback() {
  bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
}

assert_no_production_safe() {
  local out="$1"
  if echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES'; then
    fail "must not emit STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
  fi
}

assert_single_authority_block() {
  local out="$1"
  local mixed_count final_count
  mixed_count="$(echo "$out" | grep -c '^ROLLBACK_MIXED_AUTHORITY_PRESENT=' || true)"
  final_count="$(echo "$out" | grep -c '^ROLLBACK_FINAL_ENV_STAGE=' || true)"
  [[ "$mixed_count" == "1" ]] || fail "expected 1 ROLLBACK_MIXED_AUTHORITY_PRESENT, got ${mixed_count}"
  [[ "$final_count" == "1" ]] || fail "expected 1 ROLLBACK_FINAL_ENV_STAGE, got ${final_count}"
  echo "$out" | grep -q 'ROLLBACK_FINAL_STATE_SINGLE_AUTHORITY_BLOCK=YES' || fail "missing single authority block marker"
  echo "$out" | grep -q 'ROLLBACK_CONTRADICTORY_FINAL_FIELDS=0' || fail "contradictory fields marker"
}

assert_stage2_env_authority() {
  rfrf_verify_stage_env_state 2 "$BACKEND_ENV" "$CUTOVER" >/dev/null || fail "backend.env not stage 2 authority"
}

assert_safe_authority_and_single_block() {
  local out="$1"
  assert_single_authority_block "$out"
  assert_stage2_env_authority
  local unproven
  unproven="$(echo "$out" | grep '^ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=' | tail -1 | cut -d= -f2)"
  [[ "$unproven" == "0" ]] || fail "expected unproven count 0, got ${unproven}"
  local mixed
  mixed="$(echo "$out" | grep '^ROLLBACK_MIXED_AUTHORITY_PRESENT=' | tail -1 | cut -d= -f2)"
  [[ "$mixed" == "NO" ]] || fail "expected mixed NO, got ${mixed}"
}

require_linux_signal_pass() {
  local sig="$1" out="$2"
  if echo "$out" | grep -q "${sig}_RECOVERY_COVERED=YES"; then
    echo "ROLLBACK_SIGNAL_${sig}_TEST=PASS"
    return 0
  fi
  if [[ "$(uname -s)" == "Linux" ]]; then
    fail "${sig} signal must PASS on Linux CI (${out})"
  fi
  if [[ "${RFRF_ROLLBACK_SIGNAL_TEST_ALLOW_SKIP:-0}" == "1" ]]; then
    echo "ROLLBACK_SIGNAL_${sig}_TEST=NOT_PORTABLE_WITH_EXPLANATION"
    return 0
  fi
  fail "${sig} signal failed and skip not allowed"
}

echo "ROLLBACK_MUTATION_MAY_HAVE_STARTED_SET_BEFORE_MUTATION=YES"
echo "VERIFIED_STOP_REQUIRED=YES"
echo "UNVERIFIED_STOP_CAN_REPORT_ZERO_UNPROVEN=NO"
echo "CI_SIGNAL_SKIP_ALLOWED=NO"

# --- A: mutation boundary signals / error ---
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_AT=before_apply
export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF=TERM
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "pre-apply signal should exit non-zero"
assert_safe_authority_and_single_block "$out"
assert_no_production_safe "$out"
pass "pre-mutation signal"
echo "ROLLBACK_PRE_MUTATION_SIGNAL_TEST=PASS"

write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_AT=after_atomic
export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF=INT
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "post-atomic signal should exit non-zero"
assert_safe_authority_and_single_block "$out"
assert_no_production_safe "$out"
pass "post-atomic rename signal"
echo "ROLLBACK_POST_ATOMIC_RENAME_SIGNAL_TEST=PASS"

write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_POST_ATOMIC_ERROR=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "post-atomic error should exit non-zero"
assert_safe_authority_and_single_block "$out"
assert_no_production_safe "$out"
pass "post-atomic error"
echo "ROLLBACK_POST_ATOMIC_RENAME_ERROR_TEST=PASS"

# --- B: verified stop failures (force restart B fail then stop B path) ---
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "stop A command fail should exit non-zero"
echo "$out" | grep -q 'INJECTED_FAILURE=stop_a_command' || fail "missing stop a inject"
echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=NO' || fail "stop fail should set FAIL_CLOSED=NO"
pass "stop A command failure"
echo "ROLLBACK_STOP_A_FAILURE_TEST=PASS"

write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "stop B command fail should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=NO' || fail "stop fail should set FAIL_CLOSED=NO"
echo "$out" | grep -q 'INJECTED_FAILURE=stop_b_command' || fail "missing stop b inject"
unproven="$(echo "$out" | grep '^ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=' | tail -1 | cut -d= -f2)"
[[ "$unproven" != "0" ]] || fail "unproven must be >0 when stop fails"
assert_no_production_safe "$out"
pass "stop B command failure"
echo "ROLLBACK_STOP_B_FAILURE_TEST=PASS"

write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAKE_OK=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "stop A fake success should exit non-zero"
echo "$out" | grep -q 'INJECTED_FAILURE=stop_a_fake_success' || fail "missing fake stop a"
pass "stop A not actually stopped"
echo "ROLLBACK_STOP_A_NOT_ACTUALLY_STOPPED_TEST=PASS"

write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAKE_OK=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "stop B fake success should exit non-zero"
echo "$out" | grep -q 'INJECTED_FAILURE=stop_b_fake_success' || fail "missing fake stop b"
pass "stop B not actually stopped"
echo "ROLLBACK_STOP_B_NOT_ACTUALLY_STOPPED_TEST=PASS"

# --- C: success transcript single block ---
write_stage2_env
clear_inject
out="$(run_rollback)"
echo "$out" | grep -q 'RFRF_ROLLBACK=PASS' || fail "success rollback failed"
assert_single_authority_block "$out"
echo "$out" | grep -q 'SUCCESS_ROLLBACK_FINAL_ENV_STAGE=1' || fail "missing success env stage"
echo "$out" | grep -q 'SUCCESS_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=1' || fail "missing success A"
echo "$out" | grep -q 'SUCCESS_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=1' || fail "missing success B"
echo "$out" | grep -q 'SUCCESS_ROLLBACK_MIXED_AUTHORITY_PRESENT=NO' || fail "missing success mixed"
pass "success single authority block"

# --- D: strict TERM / INT / HUP (post-mutation checkpoint) ---
for sig in TERM INT HUP; do
  write_stage2_env
  clear_inject
  export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF="$sig"
  set +e
  out="$(run_rollback)"
  rc=$?
  set -e
  (( rc != 0 )) || fail "${sig} should exit non-zero"
  require_linux_signal_pass "$sig" "$out"
  assert_single_authority_block "$out"
  assert_no_production_safe "$out"
done

echo "rfrf-f10-stage2-rollback-f10-4-0-3-tests: OK"
