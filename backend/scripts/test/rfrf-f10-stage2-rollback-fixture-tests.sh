#!/usr/bin/env bash
# RFRF F10.4.0.1 / F10.4.0.2 Stage-2 rollback dry-run + fail-closed fixture tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "STAGE2_ROLLBACK_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE2_ROLLBACK_TEST_PASS: $*"; }

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

write_stage1_env() {
  cat >"$BACKEND_ENV" <<EOF
METRICS_BEARER_TOKEN=fixture-token
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=${CUTOVER}
EOF
}

write_malformed_stage2_env() {
  cat >"$BACKEND_ENV" <<EOF
METRICS_BEARER_TOKEN=fixture-token
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=${CUTOVER}
RAW_FUEL_REFUEL_FALLBACK_ENABLED=true
RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED=true
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
}

assert_no_production_safe() {
  local out="$1"
  if echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES'; then
    fail "must not emit STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
  fi
}

assert_fail_closed_no_mixed() {
  local out="$1"
  echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=YES' || fail "missing ROLLBACK_FAIL_CLOSED=YES"
  local mixed_count
  mixed_count="$(echo "$out" | grep -c '^ROLLBACK_MIXED_AUTHORITY_PRESENT=' || true)"
  [[ "$mixed_count" == "1" ]] || fail "expected single MIXED marker, got ${mixed_count}"
  local mixed
  mixed="$(echo "$out" | grep '^ROLLBACK_MIXED_AUTHORITY_PRESENT=' | tail -1 | cut -d= -f2)"
  [[ "$mixed" == "NO" ]] || fail "mixed authority must be NO after fail-closed"
  local unproven
  unproven="$(echo "$out" | grep '^ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=' | tail -1 | cut -d= -f2)"
  [[ "$unproven" == "0" ]] || fail "missing unproven count zero (got ${unproven})"
}

# A — Stage 2 source + dry-run PASS, zero mutation
write_stage2_env
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
dry="$(DRY_RUN=1 bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1)"
after_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before_sha" == "$after_sha" ]] || fail "dry-run A mutated env"
echo "$dry" | grep -q 'ROLLBACK_DRY_RUN_SOURCE_STAGE_VERIFIED=YES' || fail "dry-run A missing source verify"
echo "$dry" | grep -q 'RFRF_ROLLBACK_DRY_RUN=PASS' || fail "dry-run A should pass"
pass "rollback dry-run stage2 source"
echo "ROLLBACK_DRY_RUN_SOURCE_STAGE_VERIFIED=YES"
echo "ROLLBACK_DRY_RUN_ZERO_MUTATION=PASS"

# B — Stage 1 source + --from-stage 2 => BLOCKED
write_stage1_env
set +e
wrong="$(DRY_RUN=1 bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "dry-run B should block wrong source stage"
echo "$wrong" | grep -q 'RFRF_ROLLBACK=BLOCKED' || fail "dry-run B missing BLOCKED marker"
pass "rollback dry-run wrong source blocked"
echo "ROLLBACK_DRY_RUN_WRONG_SOURCE_STAGE_BLOCKED=YES"

# C — malformed Stage-2 matrix => BLOCKED
write_malformed_stage2_env
set +e
bad="$(DRY_RUN=1 bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1)"
rc=$?
set -e
(( rc != 0 )) || fail "dry-run C should block malformed stage2"
pass "rollback dry-run malformed blocked"

run_rollback() {
  bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
}

# restart A failure
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "restart A failure should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=YES' || fail "restart A missing fail closed"
echo "$out" | grep -q 'ROLLBACK_PRE_MUTATION_RESTORE=YES' || fail "restart A should restore pre-mutation env"
rfrf_verify_stage_env_state 2 "$BACKEND_ENV" "$CUTOVER" >/dev/null || fail "restart A should restore stage 2 file"
pass "rollback restart A failure"
echo "STAGE2_ROLLBACK_RESTART_A_FAILURE_TEST=PASS"

# restart B failure after A succeeded
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "restart B failure should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES' || fail "restart B missing mixed authority prevented"
echo "$out" | grep -q 'ROLLBACK_DEGRADED_STOP_REPLICA=' || fail "restart B missing degraded stop"
if echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES'; then fail "restart B must not emit production safe"; fi
pass "rollback restart B failure"
echo "STAGE2_ROLLBACK_RESTART_B_FAILURE_TEST=PASS"
echo "STAGE2_ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"

# post-deploy verify failure
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_POST_VERIFY_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "post verify failure should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=YES' || fail "post verify missing fail closed"
if echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES'; then fail "post verify must not emit production safe"; fi
pass "rollback post verify failure"
echo "STAGE2_ROLLBACK_POST_VERIFY_FAILURE_TEST=PASS"

# stage-env verify failure (injected after mutation)
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_STAGE_VERIFY_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "stage verify inject should exit non-zero"
assert_fail_closed_no_mixed "$out"
echo "$out" | grep -q 'ROLLBACK_FAIL_CLOSED=YES' || fail "stage verify should fail closed"
assert_no_production_safe "$out"
pass "rollback stage verify failure"
echo "STAGE2_ROLLBACK_STAGE_VERIFY_FAILURE_TEST=PASS"
echo "STAGE2_ROLLBACK_STAGE_VERIFY_FAILURE_FAIL_CLOSED=YES"

# recovery-of-recovery: primary A fail + recovery A fail
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_A_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart A failure should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_RECOVERY_CONVERGENCE_ATTEMPTED=YES' || fail "recovery A: convergence attempted"
echo "$out" | grep -q 'ROLLBACK_RECOVERY_CONVERGENCE_RESULT=FAIL' || fail "recovery A: convergence fail"
echo "$out" | grep -q 'ROLLBACK_RECOVERY_FAILURE_MIXED_AUTHORITY_PREVENTED=YES' || fail "recovery A: mixed authority prevented"
assert_fail_closed_no_mixed "$out"
assert_no_production_safe "$out"
pass "recovery restart A failure"
echo "STAGE2_ROLLBACK_RECOVERY_RESTART_A_FAILURE_TEST=PASS"

# recovery-of-recovery: primary A fail + recovery A ok + recovery B fail
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_B_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "recovery restart B failure should exit non-zero"
echo "$out" | grep -q 'ROLLBACK_RECOVERY_CONVERGENCE_RESULT=FAIL' || fail "recovery B: convergence fail"
assert_fail_closed_no_mixed "$out"
assert_no_production_safe "$out"
pass "recovery restart B failure"
echo "STAGE2_ROLLBACK_RECOVERY_RESTART_B_FAILURE_TEST=PASS"

# PRE env restore fails during convergence recovery
write_stage2_env
clear_inject
export RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL=1
export RFRF_TEST_INJECT_ROLLBACK_BACKUP_RESTORE_FAIL=1
set +e
out="$(run_rollback)"
rc=$?
set -e
(( rc != 0 )) || fail "backup restore failure should exit non-zero"
echo "$out" | grep -q 'INJECTED_FAILURE=backup_restore' || fail "missing backup restore inject marker"
echo "$out" | grep -q 'ROLLBACK_RECOVERY_CONVERGENCE_RESULT=FAIL' || fail "env restore: convergence fail"
assert_fail_closed_no_mixed "$out"
assert_no_production_safe "$out"
pass "recovery env restore failure"
echo "STAGE2_ROLLBACK_RECOVERY_ENV_RESTORE_FAILURE_TEST=PASS"
echo "ROLLBACK_RECOVERY_FAILURE_MIXED_AUTHORITY_PREVENTED=YES"

# signal safety (TERM / INT / HUP) — strict on Linux / CI
for sig in TERM INT HUP; do
  write_stage2_env
  clear_inject
  export RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF="$sig"
  set +e
  out="$(run_rollback)"
  rc=$?
  set -e
  (( rc != 0 )) || fail "${sig} rollback signal should exit non-zero"
  if echo "$out" | grep -q "${sig}_RECOVERY_COVERED=YES"; then
    assert_fail_closed_no_mixed "$out"
    assert_no_production_safe "$out"
    echo "ROLLBACK_SIGNAL_${sig}_TEST=PASS"
  elif [[ "$(uname -s)" == "Linux" ]]; then
    fail "${sig} signal must PASS on Linux (output missing ${sig}_RECOVERY_COVERED)"
  elif [[ "${RFRF_ROLLBACK_SIGNAL_TEST_ALLOW_SKIP:-0}" == "1" ]]; then
    echo "ROLLBACK_SIGNAL_${sig}_TEST=NOT_PORTABLE_WITH_EXPLANATION"
  else
    fail "${sig} signal failed"
  fi
done
echo "CI_SIGNAL_SKIP_ALLOWED=NO"

# Production-style rollback dry-run SHA authority (no fixture flags)
PROD_DRY_ENV="${TMP_DIR}/prod-dry-backend.env"
write_stage2_env
cp "$BACKEND_ENV" "$PROD_DRY_ENV"
exact_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

set +e
missing_out="$(
  env -i HOME="$HOME" PATH="$PATH" \
    SYNQDRIVE_CURRENT_LINK="$REPO_ROOT" BACKEND_ENV="$PROD_DRY_ENV" DRY_RUN=1 \
    bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
)"
missing_rc=$?
set -e
(( missing_rc != 0 )) || fail "production dry-run missing SHA should block"
echo "$missing_out" | grep -q 'ROLLBACK_PRODUCTION_DRY_RUN_MISSING_SHA_BLOCKED=YES' || fail "missing SHA marker"
echo "ROLLBACK_PRODUCTION_DRY_RUN_SHA_REQUIRED=YES"
echo "ROLLBACK_PRODUCTION_DRY_RUN_MISSING_SHA_BLOCKED=YES"

set +e
mismatch_out="$(
  env -i HOME="$HOME" PATH="$PATH" \
    SYNQDRIVE_CURRENT_LINK="$REPO_ROOT" BACKEND_ENV="$PROD_DRY_ENV" DRY_RUN=1 \
    RFRF_REQUIRED_GIT_SHA=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef \
    bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
)"
mismatch_rc=$?
set -e
(( mismatch_rc != 0 )) || fail "production dry-run SHA mismatch should block"
echo "$mismatch_out" | grep -q 'ROLLBACK_PRODUCTION_DRY_RUN_SHA_MISMATCH_BLOCKED=YES' || fail "mismatch marker"
echo "ROLLBACK_PRODUCTION_DRY_RUN_SHA_MISMATCH_BLOCKED=YES"

set +e
pass_out="$(
  env -i HOME="$HOME" PATH="$PATH" \
    SYNQDRIVE_CURRENT_LINK="$REPO_ROOT" BACKEND_ENV="$PROD_DRY_ENV" DRY_RUN=1 \
    RFRF_REQUIRED_GIT_SHA="$exact_sha" \
    bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
)"
pass_rc=$?
set -e
(( pass_rc == 0 )) || fail "production dry-run exact SHA should pass: ${pass_out}"
echo "$pass_out" | grep -q 'ROLLBACK_PRODUCTION_DRY_RUN_EXACT_SHA_PASS=YES' || fail "exact SHA pass marker"
echo "ROLLBACK_PRODUCTION_DRY_RUN_EXACT_SHA_PASS=YES"

# Fixture dry-run without production SHA requirement (D)
write_stage2_env
set +e
fix_out="$(
  env -i HOME="$HOME" PATH="$PATH" \
    SYNQDRIVE_CURRENT_LINK="$REPO_ROOT" BACKEND_ENV="$BACKEND_ENV" DRY_RUN=1 RFRF_FIXTURE_MODE=1 \
    bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1
)"
fix_rc=$?
set -e
(( fix_rc == 0 )) || fail "fixture dry-run should pass without RFRF_REQUIRED_GIT_SHA"
echo "$fix_out" | grep -q 'RFRF_ROLLBACK_DRY_RUN=PASS' || fail "fixture dry-run pass"

# successful rollback (must be last mutating success)
write_stage2_env
clear_inject
out="$(run_rollback)"
echo "$out" | grep -q 'RFRF_ROLLBACK=PASS' || fail "rollback should pass: ${out}"
echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES' || fail "missing production safe marker"
mixed_count="$(echo "$out" | grep -c '^ROLLBACK_MIXED_AUTHORITY_PRESENT=' || true)"
[[ "$mixed_count" == "1" ]] || fail "success transcript must have single MIXED marker"
echo "$out" | grep -q 'ROLLBACK_FINAL_STATE_SINGLE_AUTHORITY_BLOCK=YES' || fail "missing single authority block"
rfrf_verify_stage_env_state 1 "$BACKEND_ENV" "$CUTOVER" || fail "post-rollback not stage 1"
pass "stage2 rollback success"
echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"

echo "rfrf-f10-stage2-rollback-fixture: OK"
