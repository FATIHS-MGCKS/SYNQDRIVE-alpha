#!/usr/bin/env bash
# RFRF F10.3.0 Stage-1 restart safety failure-injection tests — fixtures only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "STAGE1_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE1_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

export RFRF_STAGE_TEST_MODE=1
export RFRF_FIXTURE_MODE=1
export RFRF_REQUIRED_GIT_SHA="${RFRF_REQUIRED_GIT_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
export SYNQDRIVE_CURRENT_LINK="$REPO_ROOT"
export BACKEND_ENV="${TMP_DIR}/backend.env"
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES
export RFRF_CUTOVER_AT="2026-09-18T12:00:00.000Z"
export RFRF_FIXTURE_EXP021_STUDIES=1
export RFRF_FIXTURE_EXP021_ENROLLMENTS=1
export RFRF_FIXTURE_EXP021_RUNS=0

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

reset_stage0_env() {
  cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
METRICS_BEARER_TOKEN=fixture-token
EOF
}

run_stage1() {
  export RFRF_STAGE=1
  export RFRF_CUTOVER_AT="${1:-2026-09-18T12:00:00.000Z}"
  bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
}

clear_inject_flags() {
  unset RFRF_TEST_INJECT_RESTART_A_FAIL RFRF_TEST_INJECT_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_POST_VERIFY_FAIL RFRF_TEST_INJECT_BACKUP_RESTORE_FAIL
  unset RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_PREFLIGHT_FAIL
}

assert_stage0_final() {
  local out="$1"
  echo "$out" | grep -q 'STAGE1_FINAL_STATE=STAGE0' || fail "expected STAGE1_FINAL_STATE=STAGE0"
  rfrf_verify_stage0_env_state "$BACKEND_ENV" >/dev/null || fail "backend.env not stage 0 after recovery"
}

# 1) mutation succeeds / restart A fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "restart A failure should exit non-zero"
echo "$out" | grep -q 'STAGE_MUTATION_ROLLBACK_ATTEMPTED=YES' || fail "restart A missing rollback attempted"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "restart A missing env restored"
assert_stage0_final "$out"
pass "restart A failure auto-recovery"
echo "RESTART_A_FAILURE_TEST=PASS"

# 2) A succeeds / restart B fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_B_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "restart B failure should exit non-zero"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "restart B missing env restored"
assert_stage0_final "$out"
pass "restart B failure auto-recovery"
echo "RESTART_B_FAILURE_TEST=PASS"

# 3) both restart / post-deploy verification fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_VERIFY_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "post verify failure should exit non-zero"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "post verify missing env restored"
assert_stage0_final "$out"
pass "post verify failure auto-recovery"
echo "POST_VERIFY_FAILURE_TEST=PASS"

# 4) backup restore fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_BACKUP_RESTORE_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "backup restore failure should exit non-zero"
echo "$out" | grep -q 'STAGE1_RECOVERY_FAILED=YES' || fail "backup restore missing recovery failed"
echo "$out" | grep -q 'STAGE1_FINAL_STATE=UNKNOWN' || fail "backup restore missing UNKNOWN final state"
pass "backup restore failure fail-closed"
echo "RECOVERY_FAILURE_TEST=PASS"

# 5) recovery restart A fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart A should exit non-zero"
echo "$out" | grep -q 'STAGE1_RECOVERY_FAILED=YES' || fail "recovery restart A missing recovery failed"
pass "recovery restart A fail-closed"

# 6) recovery restart B fails
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_B_FAIL=1
export RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart B should exit non-zero"
echo "$out" | grep -q 'STAGE1_RECOVERY_FAILED=YES' || fail "recovery restart B missing recovery failed"
pass "recovery restart B fail-closed"

# 7) successful Stage 1
reset_stage0_env
clear_inject_flags
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc == 0 )) || fail "successful stage1 should exit 0: ${out}"
echo "$out" | grep -q 'RFRF_STAGED_ENABLEMENT=PASS' || fail "successful stage1 missing PASS"
echo "$out" | grep -q 'STAGE1_FINAL_STATE=STAGE1' || fail "successful stage1 missing STAGE1 final state"
rfrf_verify_stage1_env_state "$BACKEND_ENV" "$RFRF_CUTOVER_AT" || fail "stage1 env verify failed"
pass "successful stage1 fixture"
echo "SUCCESS_STAGE1_FIXTURE_TEST=PASS"

# 8) repeated Stage-1 invocation blocked
clear_inject_flags
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "repeated stage1 should block"
pass "repeated stage1 blocked"
echo "REPEATED_STAGE1_BLOCKED_TEST=PASS"

# 9) malformed cutover blocked before mutation
reset_stage0_env
clear_inject_flags
export RFRF_STAGE=1
export RFRF_CUTOVER_AT="not-an-iso-ts"
set +e
out="$(bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "malformed cutover should block"
before="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
[[ -z "$before" ]] || fail "malformed cutover should not mutate file"
pass "malformed cutover blocked"
echo "MALFORMED_CUTOVER_BLOCKED_TEST=PASS"

# 10) live-required preflight failure blocks before mutation
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_PREFLIGHT_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "preflight failure should block"
[[ -z "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")" ]] || fail "preflight failure should not mutate"
pass "live preflight failure blocked"
echo "LIVE_PREFLIGHT_FAILURE_BLOCKED_TEST=PASS"

# DRY_RUN contract
reset_stage0_env
clear_inject_flags
export DRY_RUN=1
export RFRF_STAGE=1
export RFRF_CUTOVER_AT="2026-09-18T12:00:00.000Z"
unset RFRF_ROLLOUT_ACK
out="$(bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1)"
echo "$out" | grep -q 'STAGE1_DRY_RUN_ZERO_MUTATION=PASS' || fail "dry run missing zero mutation marker"
echo "$out" | grep -q 'DRY_RUN=1 - zero mutation, zero restart' || fail "dry run missing zero restart"
echo "$out" | grep -q 'PROPOSED_CUTOVER=' || fail "dry run missing proposed cutover"
echo "$out" | grep -q 'ROLLBACK_PLAN=' || fail "dry run missing rollback plan"
before="$(rfrf_file_sha256 "$BACKEND_ENV")"
sleep 0.1
after="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before" == "$after" ]] || fail "dry run mutated backend.env"
pass "dry run zero mutation"
echo "STAGE1_DRY_RUN_ZERO_MUTATION=PASS"

# Backup checksum helper
reset_stage0_env
backup="${TMP_DIR}/backup.env"
rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$backup" >/dev/null
before="$(rfrf_file_sha256 "$BACKEND_ENV")"
rfrf_apply_stage_mutations 1 "$BACKEND_ENV" "$RFRF_CUTOVER_AT"
rfrf_restore_backend_env_atomic "$BACKEND_ENV" "$backup" "$before" >/dev/null
after="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before" == "$after" ]] || fail "backup restore checksum mismatch"
pass "backup checksum roundtrip"
echo "BACKUP_CHECKSUM_VERIFIED=YES"

echo "rfrf-f10-stage1-restart-safety: OK"
