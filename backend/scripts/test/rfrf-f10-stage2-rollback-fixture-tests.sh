#!/usr/bin/env bash
# RFRF F10.4.0.1 Stage-2 rollback dry-run + convergence fixture tests.
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
echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES' && fail "restart B must not emit production safe"
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
echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES' && fail "post verify must not emit production safe"
pass "rollback post verify failure"
echo "STAGE2_ROLLBACK_POST_VERIFY_FAILURE_TEST=PASS"

# successful rollback (must be last mutating success)
write_stage2_env
clear_inject
out="$(run_rollback)"
echo "$out" | grep -q 'RFRF_ROLLBACK=PASS' || fail "rollback should pass: ${out}"
echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES' || fail "missing production safe marker"
rfrf_verify_stage_env_state 1 "$BACKEND_ENV" "$CUTOVER" || fail "post-rollback not stage 1"
pass "stage2 rollback success"
echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"

echo "rfrf-f10-stage2-rollback-fixture: OK"
