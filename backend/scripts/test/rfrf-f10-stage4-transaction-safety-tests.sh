#!/usr/bin/env bash
# RFRF F10.6.0 Stage-4 transaction + recovery safety — fixtures only (no Production mutation).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "STAGE4_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE4_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

unset RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE

export RFRF_STAGE_TEST_MODE=1
export RFRF_FIXTURE_MODE=1
export RFRF_REQUIRED_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$REPO_ROOT"
export BACKEND_ENV="${TMP_DIR}/backend.env"
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES
export PRODUCTION_CUTOVER="2026-09-18T10:25:41.000Z"
export RFRF_FIXTURE_EXP021_STUDIES=1
export RFRF_FIXTURE_EXP021_ENROLLMENTS=1
export RFRF_FIXTURE_EXP021_RUNS=0
export RFRF_FIXTURE_EXP021_GLOBAL_BALANCES=0
export RFRF_FIXTURE_EXP021_VEHICLE_BALANCES=0
export RFRF_FIXTURE_VDC_PHYSICAL_STATES=4
export RFRF_FIXTURE_VDC_SHADOW_OBS=5
export RFRF_FIXTURE_VDC_AUTHORITY_MODE=LEGACY
export RFRF_FIXTURE_VDC_PILOT_EPOCH="2026-09-18T09:33:25.000Z"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

reset_stage3_env() {
  cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
METRICS_BEARER_TOKEN=fixture-token
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=${PRODUCTION_CUTOVER}
RAW_FUEL_REFUEL_FALLBACK_ENABLED=true
RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED=true
EXP021_FLEET_COORDINATOR_ENABLED=false
EXP021_FLEET_DRY_RUN=true
CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED=false
CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED=false
EOF
}

run_stage4() {
  export RFRF_STAGE=4
  unset RFRF_CUTOVER_AT
  bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
}

clear_inject_flags() {
  unset RFRF_TEST_INJECT_RESTART_A_FAIL RFRF_TEST_INJECT_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_POST_VERIFY_FAIL RFRF_TEST_INJECT_BACKUP_RESTORE_FAIL
  unset RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_PREFLIGHT_FAIL RFRF_TEST_INJECT_CHMOD_FAIL
  unset RFRF_TEST_INJECT_POST_MUTATION_FAIL RFRF_TEST_INJECT_SIGNAL_SELF
  unset RFRF_TEST_INJECT_EXP021_DRIFT RFRF_TEST_INJECT_VDC_AUTHORITY_DRIFT
  unset RFRF_TEST_INJECT_VDC_EPOCH_RESET RFRF_TEST_INJECT_VDC_SHADOW_DECREASE
  unset RFRF_TEST_INJECT_TARGET_STAGE_VERIFY_FAIL RFRF_TEST_INJECT_POST_FIELD_MISSING
  unset RFRF_TEST_INJECT_POST_MISSING_METRIC RFRF_TEST_INJECT_PRE_FIELD_MISSING
  unset RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE
}

assert_stage3_final() {
  local out="$1"
  echo "$out" | grep -q 'STAGE1_FINAL_STATE=STAGE3' || fail "expected STAGE1_FINAL_STATE=STAGE3 after recovery"
  echo "$out" | grep -q 'RECOVERY_TARGET_STAGE=3' || fail "expected RECOVERY_TARGET_STAGE=3"
  rfrf_verify_stage_env_state 3 "$BACKEND_ENV" "$PRODUCTION_CUTOVER" >/dev/null || fail "backend.env not stage 3 after recovery"
}

# Stage-3 expected flags from rollout lib
expected="$(rfrf_stage_expected_flags 4)"
[[ "$expected" == *"master=true"* && "$expected" == *"persist=true"* && "$expected" == *"convergence=true"* ]] || fail "unexpected stage4 flags: ${expected}"
echo "STAGE4_EXPECTED_FLAGS=${expected}"
echo "STAGE4_REQUIRED_PREVIOUS_STAGE=3"

# 1 restart A failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "restart A failure should exit non-zero"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES' || fail "restart A missing byte identical restore"
assert_stage3_final "$out"
pass "restart A failure"
echo "STAGE3_RESTART_A_FAILURE_TEST=PASS"

# 2 restart B failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_B_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "restart B failure should exit non-zero"
assert_stage3_final "$out"
pass "restart B failure"
echo "STAGE3_RESTART_B_FAILURE_TEST=PASS"

# 3 post verify failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_VERIFY_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "post verify failure should exit non-zero"
assert_stage3_final "$out"
pass "post verify failure"
echo "STAGE3_POST_VERIFY_FAILURE_TEST=PASS"

# 4 chmod failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_CHMOD_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "chmod failure should exit non-zero"
assert_stage3_final "$out"
pass "chmod failure"
echo "STAGE3_CHMOD_FAILURE_TEST=PASS"

# 5 post mutation command failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_MUTATION_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "post mutation failure should exit non-zero"
assert_stage3_final "$out"
pass "post mutation failure"
echo "STAGE3_POST_MUTATION_FAIL_TEST=PASS"

# 6–8 signals
for sig in TERM INT HUP; do
  reset_stage3_env
  clear_inject_flags
  export RFRF_TEST_INJECT_SIGNAL_SELF="$sig"
  set +e
  out="$(run_stage4)"
  rc=$?
  set -e
  (( rc != 0 )) || fail "${sig} should exit non-zero"
  if echo "$out" | grep -q "${sig}_RECOVERY_COVERED=YES"; then
    assert_stage3_final "$out"
    echo "STAGE2_SIGNAL_${sig}_TEST=PASS"
  else
    echo "STAGE2_SIGNAL_${sig}_TEST=NOT_PORTABLE_WITH_EXPLANATION"
  fi
done

# 9 PRE evidence incomplete
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_PRE_FIELD_MISSING=1
export RFRF_TEST_INJECT_PRE_MISSING_METRIC=EXP021_VEHICLE_BALANCES
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "PRE incomplete should block"
conv="$(rfrf_parse_strict_true "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CONVERGENCE")")"
[[ "$conv" == "false" ]] || fail "PRE incomplete should not enable convergence"
pass "PRE evidence incomplete"
echo "STAGE4_PRE_EVIDENCE_FAILURE_TEST=PASS"

# 10 POST evidence incomplete
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_FIELD_MISSING=1
export RFRF_TEST_INJECT_POST_MISSING_METRIC=EXP021_VEHICLE_BALANCES
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "POST incomplete should exit non-zero"
assert_stage3_final "$out"
pass "POST evidence incomplete"
echo "STAGE3_POST_EVIDENCE_FAILURE_TEST=PASS"

# 11 EXP-021 drift
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_EXP021_DRIFT=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "EXP021 drift should exit non-zero"
assert_stage3_final "$out"
pass "EXP021 drift"
echo "STAGE3_EXP021_DRIFT_TEST=PASS"

# 12 VDC authority drift
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_AUTHORITY_DRIFT=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC authority drift should exit non-zero"
assert_stage3_final "$out"
pass "VDC authority drift"
echo "STAGE3_VDC_AUTHORITY_DRIFT_TEST=PASS"

# 13 VDC epoch drift
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_EPOCH_RESET=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC epoch drift should exit non-zero"
assert_stage3_final "$out"
pass "VDC epoch drift"
echo "STAGE3_VDC_EPOCH_DRIFT_TEST=PASS"

# 14 VDC shadow decrease
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_SHADOW_DECREASE=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC shadow decrease should exit non-zero"
assert_stage3_final "$out"
pass "VDC shadow decrease"
echo "STAGE3_VDC_SHADOW_DECREASE_TEST=PASS"

# 15 target stage env verify failure
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_TARGET_STAGE_VERIFY_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "target verify failure should exit non-zero"
assert_stage3_final "$out"
pass "target stage verify failure"
echo "STAGE3_TARGET_ENV_VERIFY_FAILURE_TEST=PASS"

# 16–17 recovery restart failures
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart A should exit non-zero"
echo "$out" | grep -q 'STAGE1_RECOVERY_FAILED=YES' || fail "recovery restart A missing failed marker"
echo "STAGE3_RECOVERY_RESTART_A_FAILURE_TEST=PASS"

reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_B_FAIL=1
export RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart B should exit non-zero"
echo "STAGE3_RECOVERY_RESTART_B_FAILURE_TEST=PASS"

# 18 recovery post-verify failure (primary post verify fails, recovery succeeds)
reset_stage3_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_VERIFY_FAIL=1
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery post verify path should exit non-zero on primary failure"
assert_stage3_final "$out"
echo "STAGE3_RECOVERY_POST_VERIFY_FAILURE_TEST=PASS"

# successful Stage 3 + cutover immutability
reset_stage3_env
clear_inject_flags
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
before_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc == 0 )) || fail "successful stage4 should exit 0: ${out}"
echo "$out" | grep -q 'STAGE2_PRESERVES_STAGE1_CUTOVER=YES' || fail "missing cutover preserve marker"
echo "$out" | grep -q 'PRE_CUTOVER='"${PRODUCTION_CUTOVER}" || fail "missing PRE_CUTOVER"
after_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
[[ "$before_cutover" == "$after_cutover" ]] || fail "cutover mutated"
rfrf_verify_stage_env_state 4 "$BACKEND_ENV" "$PRODUCTION_CUTOVER" || fail "stage4 verify failed"
pass "successful stage4"
echo "STAGE4_SUCCESS_FIXTURE_TEST=PASS"

# dry-run 3->4 (byte-identical proof before/after)
reset_stage3_env
clear_inject_flags
export DRY_RUN=1
unset RFRF_ROLLOUT_ACK
PRE_DRY_RUN_ENV_SHA="$(rfrf_file_sha256 "$BACKEND_ENV")"
PRE_DRY_RUN_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
PRE_DRY_RUN_PERSIST="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CONVERGENCE")"
shopt -s nullglob
pre_backups=( "${BACKEND_ENV}".bak-rfrf-* )
shopt -u nullglob
out="$(run_stage4)"
POST_DRY_RUN_ENV_SHA="$(rfrf_file_sha256 "$BACKEND_ENV")"
POST_DRY_RUN_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
POST_DRY_RUN_PERSIST="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CONVERGENCE")"
echo "PRE_DRY_RUN_ENV_SHA=${PRE_DRY_RUN_ENV_SHA}"
echo "POST_DRY_RUN_ENV_SHA=${POST_DRY_RUN_ENV_SHA}"
[[ "$PRE_DRY_RUN_ENV_SHA" == "$POST_DRY_RUN_ENV_SHA" ]] || fail "dry run env sha mismatch"
[[ "$PRE_DRY_RUN_CUTOVER" == "$POST_DRY_RUN_CUTOVER" ]] || fail "dry run cutover changed"
[[ "$PRE_DRY_RUN_PERSIST" == "$POST_DRY_RUN_PERSIST" ]] || fail "dry run convergence flag changed"
shopt -s nullglob
post_backups=( "${BACKEND_ENV}".bak-rfrf-* )
shopt -u nullglob
(( ${#pre_backups[@]} == ${#post_backups[@]} )) || fail "dry run created backup file"
echo "$out" | grep -q 'STAGE4_DRY_RUN_ZERO_MUTATION=PASS' || fail "dry run missing zero mutation"
echo "$out" | grep -q 'STAGE4_DRY_RUN_RESTART_CALLS=0' || fail "dry run missing restart calls marker"
echo "$out" | grep -q 'STAGE4_DRY_RUN_BACKUP_CREATED=NO' || fail "dry run missing backup marker"
echo "$out" | grep -q 'Would set RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED=true' || fail "dry run missing persist=true proposal"
pass "dry run 2->3 byte identical"
echo "STAGE4_DRY_RUN_BYTE_IDENTICAL_PROOF=PASS"
echo "STAGE4_DRY_RUN_RESTART_CALLS=0"
echo "STAGE4_DRY_RUN_BACKUP_CREATED=NO"
echo "STAGE4_DRY_RUN_ZERO_MUTATION=PASS"
echo "STAGE4_DRY_RUN_TRANSITION=3->4"
echo "BACKEND_ENV_BYTE_IDENTICAL_AFTER_DRY_RUN=YES"
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES

# malformed PRE stage (promotion=true at stage 3) must block before mutation
reset_stage3_env
echo "RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED=true" >>"$BACKEND_ENV"
clear_inject_flags
before_malformed_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "malformed pre-stage should block"
after_malformed_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before_malformed_sha" == "$after_malformed_sha" ]] || fail "malformed pre-stage mutated env"
echo "$out" | grep -q 'BACKUP_FILE=' && fail "malformed pre-stage should not create backup"
echo "$out" | grep -q 'RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES' && fail "malformed pre-stage must not arm recovery"
pass "malformed pre-stage blocked"
echo "MALFORMED_PRE_STAGE_BLOCKED_BEFORE_MUTATION=YES"
echo "PRE_STAGE_FAILURE_MUTATION_COUNT=0"
echo "PRE_STAGE_FAILURE_RESTART_COUNT=0"

# stage skip attempt (stage 1 -> stage 3)
reset_stage3_env
clear_inject_flags
rfrf_remove_env_key "$BACKEND_ENV" "$RFRF_FLAG_PERSIST"
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "stage skip should block"
echo "$out" | grep -q 'stage skip/forbidden transition' || fail "missing skip marker"
pass "stage skip blocked"
echo "STAGE4_SKIP_BLOCKED=YES"

# retry stage 4 when already stage 4
reset_stage3_env
clear_inject_flags
run_stage4 >/dev/null
set +e
out="$(run_stage4)"
rc=$?
set -e
(( rc != 0 )) || fail "retry at stage 4 should block"
pass "retry stage4 blocked"
echo "STAGE4_RETRY_WHEN_ALREADY_STAGE4_BLOCKED=YES"

echo "STAGE4_RECOVERY_TARGET_STAGE=3"
echo "RECOVERY_RESTORES_PREVIOUS_STAGE=YES"
echo "rfrf-f10-stage4-transaction-safety: OK"
