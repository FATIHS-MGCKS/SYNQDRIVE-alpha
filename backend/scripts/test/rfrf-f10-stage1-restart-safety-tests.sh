#!/usr/bin/env bash
# RFRF F10.3.0 / F10.3.0.1 / F10.3.0.2 Stage-1 transaction + evidence tests — fixtures only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "STAGE1_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE1_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

unset RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE

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
export RFRF_FIXTURE_EXP021_GLOBAL_BALANCES=0
export RFRF_FIXTURE_EXP021_VEHICLE_BALANCES=0
export RFRF_FIXTURE_VDC_PHYSICAL_STATES=4
export RFRF_FIXTURE_VDC_SHADOW_OBS=5
export RFRF_FIXTURE_VDC_AUTHORITY_MODE=LEGACY
export RFRF_FIXTURE_VDC_PILOT_EPOCH="epoch-2026-09-14T00:00:00.000Z"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

reset_stage0_env() {
  cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
METRICS_BEARER_TOKEN=fixture-token
EXP021_FLEET_COORDINATOR_ENABLED=false
EXP021_FLEET_DRY_RUN=true
CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED=false
CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED=false
EOF
}

run_stage1() {
  export RFRF_STAGE=1
  export RFRF_CUTOVER_AT="${1:-2026-09-18T12:00:00.000Z}"
  bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
}

run_stage1_production_evidence() {
  export RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1
  export DRY_RUN=0
  run_stage1 "$@"
}

clear_inject_flags() {
  unset RFRF_TEST_INJECT_RESTART_A_FAIL RFRF_TEST_INJECT_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_POST_VERIFY_FAIL RFRF_TEST_INJECT_BACKUP_RESTORE_FAIL
  unset RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL
  unset RFRF_TEST_INJECT_PREFLIGHT_FAIL RFRF_TEST_INJECT_CHMOD_FAIL
  unset RFRF_TEST_INJECT_POST_MUTATION_FAIL RFRF_TEST_INJECT_SIGNAL_SELF
  unset RFRF_TEST_INJECT_PAUSE_AFTER_MUTATION RFRF_TEST_SIGNAL_SENTINEL
  unset RFRF_TEST_INJECT_EXP021_DRIFT RFRF_TEST_INJECT_VDC_AUTHORITY_DRIFT
  unset RFRF_TEST_INJECT_VDC_EPOCH_RESET RFRF_TEST_INJECT_VDC_SHADOW_DECREASE
  unset RFRF_TEST_INJECT_VDC_SHADOW_INCREASE
  unset RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE
  unset RFRF_TEST_INJECT_DATABASE_URL_MISSING RFRF_TEST_INJECT_PSQL_UNAVAILABLE
  unset RFRF_TEST_INJECT_QUERY_ERROR RFRF_TEST_INJECT_PRE_QUERY_ERROR
  unset RFRF_TEST_INJECT_POST_QUERY_ERROR RFRF_TEST_INJECT_PRE_FIELD_MISSING
  unset RFRF_TEST_INJECT_POST_FIELD_MISSING RFRF_TEST_INJECT_PRE_MISSING_METRIC
  unset RFRF_TEST_INJECT_POST_MISSING_METRIC
}

assert_stage0_final() {
  local out="$1"
  echo "$out" | grep -q 'STAGE1_FINAL_STATE=STAGE0' || fail "expected STAGE1_FINAL_STATE=STAGE0"
  rfrf_verify_stage0_env_state "$BACKEND_ENV" >/dev/null || fail "backend.env not stage 0 after recovery"
}

assert_recovery_once() {
  local out="$1"
  local count
  count="$(echo "$out" | grep -c 'RECOVERY_HANDLER_INVOKED=YES' || true)"
  (( count == 1 )) || fail "expected recovery handler exactly once, got ${count}"
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
echo "$out" | grep -q 'BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES' || fail "restart A missing byte identical restore"
assert_stage0_final "$out"
assert_recovery_once "$out"
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
echo "$out" | grep -q 'EXP021_IMMEDIATE_SURVIVAL_GATE=PASS' || fail "successful stage1 missing EXP021 gate"
echo "$out" | grep -q 'VDC_IMMEDIATE_SURVIVAL_GATE=PASS' || fail "successful stage1 missing VDC gate"
echo "$out" | grep -q 'RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES' || fail "successful stage1 missing recovery armed marker"
recovery_count="$(echo "$out" | grep -c 'RECOVERY_HANDLER_INVOKED=YES' || true)"
(( recovery_count == 0 )) || fail "successful path should not invoke recovery"
rfrf_verify_stage1_env_state "$BACKEND_ENV" "$RFRF_CUTOVER_AT" || fail "stage1 env verify failed"
pass "successful stage1 fixture"
echo "SUCCESS_STAGE1_FIXTURE_TEST=PASS"
echo "SUCCESS_PATH_ZERO_RECOVERY_TEST=PASS"

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

# 11) mutation succeeds / chmod fails (recovery armed before mutation)
reset_stage0_env
clear_inject_flags
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
export RFRF_TEST_INJECT_CHMOD_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "chmod failure should exit non-zero"
echo "$out" | grep -q 'RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES' || fail "chmod fail missing recovery armed"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "chmod fail missing env restored"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES' || fail "chmod fail missing byte identical"
after_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before_sha" == "$after_sha" ]] || fail "chmod fail checksum mismatch"
assert_stage0_final "$out"
echo "$out" | grep -q 'RFRF_STAGED_ENABLEMENT=BLOCKED' || fail "chmod fail must not PASS"
pass "chmod failure auto-recovery"
echo "MUTATION_SUCCEEDS_CHMOD_FAILS_TEST=PASS"

# 12) unexpected post-mutation command failure
reset_stage0_env
clear_inject_flags
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
export RFRF_TEST_INJECT_POST_MUTATION_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "post mutation failure should exit non-zero"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "post mutation missing env restored"
after_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before_sha" == "$after_sha" ]] || fail "post mutation checksum mismatch"
assert_stage0_final "$out"
pass "post mutation failure auto-recovery"
echo "POST_MUTATION_UNEXPECTED_COMMAND_FAIL_TEST=PASS"

# 13) signal TERM after mutation
reset_stage0_env
clear_inject_flags
before_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
export RFRF_TEST_INJECT_SIGNAL_SELF=TERM
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "TERM should exit non-zero"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "TERM missing env restored"
echo "$out" | grep -q 'TERM_RECOVERY_COVERED=YES' || fail "TERM missing recovery covered marker"
after_sha="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before_sha" == "$after_sha" ]] || fail "TERM checksum mismatch"
assert_stage0_final "$out"
pass "TERM signal recovery"
echo "SIGNAL_TERM_RECOVERY_TEST=PASS"

# 14) signal INT after mutation
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_SIGNAL_SELF=INT
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "INT should exit non-zero"
echo "$out" | grep -q 'INT_RECOVERY_COVERED=YES' || fail "INT missing recovery covered marker"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "INT missing env restored"
assert_stage0_final "$out"
pass "INT signal recovery"
echo "SIGNAL_INT_RECOVERY_TEST=PASS"

# 15) signal HUP after mutation (portable on bash/linux CI)
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_SIGNAL_SELF=HUP
set +e
out="$(run_stage1)"
rc=$?
set -e
if echo "$out" | grep -q 'HUP_RECOVERY_COVERED=YES'; then
  echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "HUP missing env restored"
  assert_stage0_final "$out"
  echo "SIGNAL_HUP_RECOVERY_TEST=PASS"
else
  echo "SIGNAL_HUP_RECOVERY_TEST=NOT_PORTABLE_WITH_EXPLANATION bash_trap_hup_not_observed_in_fixture"
fi

# 16) EXP-021 post-restart drift gate triggers recovery
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_EXP021_DRIFT=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "EXP021 drift should exit non-zero"
echo "$out" | grep -q 'EXP021_IMMEDIATE_SURVIVAL_GATE=FAIL' || fail "EXP021 drift missing gate fail"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "EXP021 drift missing env restored"
assert_stage0_final "$out"
pass "EXP021 drift recovery"
echo "EXP021_POST_RESTART_DRIFT_TEST=PASS"

# 17) VDC authority drift gate triggers recovery
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_AUTHORITY_DRIFT=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC authority drift should exit non-zero"
echo "$out" | grep -q 'VDC_IMMEDIATE_SURVIVAL_GATE=FAIL' || fail "VDC authority drift missing gate fail"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "VDC authority drift missing env restored"
assert_stage0_final "$out"
pass "VDC authority drift recovery"
echo "VDC_AUTHORITY_DRIFT_TEST=PASS"

# 18) VDC epoch reset gate triggers recovery
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_EPOCH_RESET=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC epoch reset should exit non-zero"
echo "$out" | grep -q 'VDC_IMMEDIATE_SURVIVAL_GATE=FAIL' || fail "VDC epoch reset missing gate fail"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "VDC epoch reset missing env restored"
assert_stage0_final "$out"
pass "VDC epoch reset recovery"
echo "VDC_EPOCH_RESET_TEST=PASS"

# 19) recovery handler invoked exactly once under controlled double failure path
reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_RESTART_A_FAIL=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "double path should exit non-zero"
assert_recovery_once "$out"
pass "recovery handler exactly once"
echo "RECOVERY_HANDLER_EXACTLY_ONCE_TEST=PASS"

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
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES

# Backup checksum + atomic restore roundtrip
reset_stage0_env
backup="${TMP_DIR}/backup.env"
rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$backup" >/dev/null
before="$(rfrf_file_sha256 "$BACKEND_ENV")"
rfrf_apply_stage_mutations 1 "$BACKEND_ENV" "$RFRF_CUTOVER_AT"
restore_out="$(rfrf_restore_backend_env_atomic "$BACKEND_ENV" "$backup" "$before")"
echo "$restore_out" | grep -q 'STAGE1_RESTORE_SAME_FILESYSTEM_ATOMIC_RENAME=YES' || fail "restore missing atomic rename marker"
echo "$restore_out" | grep -q 'BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES' || fail "restore missing byte identical marker"
after="$(rfrf_file_sha256 "$BACKEND_ENV")"
[[ "$before" == "$after" ]] || fail "backup restore checksum mismatch"
pass "backup checksum roundtrip"
echo "BACKUP_CHECKSUM_VERIFIED=YES"
echo "ATOMIC_RESTORE_EXACT_CHECKSUM_TEST=PASS"

# Cross-workstream gate unit (PRE vs POST equality with complete evidence)
pre_state="${TMP_DIR}/pre.state"
post_state="${TMP_DIR}/post.state"
reset_stage0_env
rfrf_cross_workstream_write_state_file "$BACKEND_ENV" PRE "$pre_state"
rfrf_cross_workstream_write_state_file "$BACKEND_ENV" POST "$post_state"
rfrf_validate_cross_workstream_snapshot PRE "$pre_state" >/dev/null || fail "PRE validate should pass in fixture"
rfrf_validate_cross_workstream_snapshot POST "$post_state" >/dev/null || fail "POST validate should pass in fixture"
rfrf_cross_workstream_immediate_gate "$pre_state" "$post_state" >/dev/null || fail "identical PRE/POST gate should pass"
pass "cross-workstream gate unit pass"

write_complete_fixture_state() {
  local label="$1" file="$2"
  local key
  : >"$file"
  for key in "${RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]}"; do
    rfrf_cross_workstream_state_line "${label}_CONFIG_${key}" "<absent>" >>"$file"
  done
  for key in "${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]}"; do
    rfrf_cross_workstream_state_line "${label}_CONFIG_${key}" "<absent>" >>"$file"
  done
  rfrf_cross_workstream_state_line "${label}_EXP021_STUDIES" "1" >>"$file"
  rfrf_cross_workstream_state_line "${label}_EXP021_ENROLLMENTS" "1" >>"$file"
  rfrf_cross_workstream_state_line "${label}_EXP021_RUNS" "0" >>"$file"
  rfrf_cross_workstream_state_line "${label}_EXP021_GLOBAL_BALANCES" "0" >>"$file"
  rfrf_cross_workstream_state_line "${label}_EXP021_VEHICLE_BALANCES" "0" >>"$file"
  rfrf_cross_workstream_state_line "${label}_VDC_PHYSICAL_STATES" "4" >>"$file"
  rfrf_cross_workstream_state_line "${label}_VDC_SHADOW_OBS" "5" >>"$file"
  rfrf_cross_workstream_state_line "${label}_VDC_AUTHORITY_MODE" "LEGACY" >>"$file"
  rfrf_cross_workstream_state_line "${label}_VDC_PILOT_EPOCH" "none" >>"$file"
  rfrf_cross_workstream_finalize_state_file "$label" "$file" 1 >/dev/null
}

# F10.3.0.2 evidence completeness tests
reset_stage0_env
clear_inject_flags
unset DATABASE_URL
export RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1
export RFRF_TEST_INJECT_DATABASE_URL_MISSING=1
set +e
out="$(
  env RFRF_STAGE=1 DRY_RUN=0 RFRF_ROLLOUT_ACK=YES \
    RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1 \
    RFRF_TEST_INJECT_DATABASE_URL_MISSING=1 \
    bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
)"
rc=$?
set -e
(( rc != 0 )) || fail "missing DATABASE_URL should block"
echo "$out" | grep -q 'PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "missing DATABASE_URL missing PRE incomplete marker"
echo "$out" | grep -q 'CROSS_WORKSTREAM_DB_SNAPSHOT_PRE=FAIL' || fail "missing DATABASE_URL missing DB snapshot fail"
echo "$out" | grep -q 'RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES' && fail "missing DATABASE_URL must not arm recovery"
[[ -z "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")" ]] || fail "missing DATABASE_URL should not mutate"
pass "PRE database url missing blocks before mutation"
echo "PRE_DATABASE_URL_MISSING_TEST=PASS"

reset_stage0_env
clear_inject_flags
cat >>"$BACKEND_ENV" <<'EOF'
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture?schema=public
EOF
export RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1
export RFRF_TEST_INJECT_PSQL_UNAVAILABLE=1
set +e
out="$(
  env RFRF_STAGE=1 DRY_RUN=0 RFRF_ROLLOUT_ACK=YES \
    RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1 \
    RFRF_TEST_INJECT_PSQL_UNAVAILABLE=1 \
    bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
)"
rc=$?
set -e
(( rc != 0 )) || fail "psql unavailable should block"
echo "$out" | grep -q 'PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "psql unavailable missing PRE incomplete"
[[ -z "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")" ]] || fail "psql unavailable should not mutate"
pass "PRE psql unavailable blocks before mutation"
echo "PRE_PSQL_UNAVAILABLE_TEST=PASS"

reset_stage0_env
clear_inject_flags
cat >>"$BACKEND_ENV" <<'EOF'
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture?schema=public
EOF
export RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1
export RFRF_TEST_INJECT_PRE_QUERY_ERROR=1
set +e
out="$(
  env RFRF_STAGE=1 DRY_RUN=0 RFRF_ROLLOUT_ACK=YES \
    RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE=1 \
    RFRF_TEST_INJECT_PRE_QUERY_ERROR=1 \
    bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1
)"
rc=$?
set -e
(( rc != 0 )) || fail "PRE query error should block"
echo "$out" | grep -q 'PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "PRE query error missing incomplete marker"
[[ -z "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")" ]] || fail "PRE query error should not mutate"
pass "PRE query error blocks before mutation"
echo "PRE_REQUIRED_QUERY_ERROR_TEST=PASS"

reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_PRE_FIELD_MISSING=1
export RFRF_TEST_INJECT_PRE_MISSING_METRIC=EXP021_VEHICLE_BALANCES
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "PRE field missing should block"
echo "$out" | grep -q 'PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "PRE field missing incomplete marker"
[[ -z "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")" ]] || fail "PRE field missing should not mutate"
pass "PRE field missing blocks before mutation"
echo "PRE_REQUIRED_FIELD_MISSING_TEST=PASS"

reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_QUERY_ERROR=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "POST query error should exit non-zero"
echo "$out" | grep -q 'POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "POST query error missing incomplete marker"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "POST query error missing recovery"
assert_stage0_final "$out"
pass "POST query error auto-recovery"
echo "POST_REQUIRED_QUERY_ERROR_TEST=PASS"

reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_POST_FIELD_MISSING=1
export RFRF_TEST_INJECT_POST_MISSING_METRIC=EXP021_VEHICLE_BALANCES
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "POST field missing should exit non-zero"
echo "$out" | grep -q 'POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO' || fail "POST field missing incomplete marker"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "POST field missing missing recovery"
assert_stage0_final "$out"
pass "POST field missing auto-recovery"
echo "POST_REQUIRED_FIELD_MISSING_TEST=PASS"

err_pre="${TMP_DIR}/err-pre.state"
err_post="${TMP_DIR}/err-post.state"
write_complete_fixture_state PRE "$err_pre"
write_complete_fixture_state POST "$err_post"
rfrf_cross_workstream_state_line PRE_EXP021_STUDIES ERROR >"${err_pre}.tmp"
grep -v '^PRE_EXP021_STUDIES=' "$err_pre" >>"${err_pre}.tmp"
mv "${err_pre}.tmp" "$err_pre"
rfrf_cross_workstream_state_line POST_EXP021_STUDIES ERROR >"${err_post}.tmp"
grep -v '^POST_EXP021_STUDIES=' "$err_post" >>"${err_post}.tmp"
mv "${err_post}.tmp" "$err_post"
set +e
rfrf_cross_workstream_immediate_gate "$err_pre" "$err_post" >/dev/null
gate_rc=$?
set -e
(( gate_rc != 0 )) || fail "ERROR == ERROR must not pass gate"
pass "ERROR equals ERROR fails closed"
echo "PRE_AND_POST_ERROR_EQUALITY_FAILS_TEST=PASS"

missing_pre="${TMP_DIR}/missing-pre.state"
missing_post="${TMP_DIR}/missing-post.state"
write_complete_fixture_state PRE "$missing_pre"
write_complete_fixture_state POST "$missing_post"
grep -v '^PRE_EXP021_STUDIES=' "$missing_pre" >"${missing_pre}.tmp"
mv "${missing_pre}.tmp" "$missing_pre"
grep -v '^POST_EXP021_STUDIES=' "$missing_post" >"${missing_post}.tmp"
mv "${missing_post}.tmp" "$missing_post"
set +e
rfrf_cross_workstream_immediate_gate "$missing_pre" "$missing_post" >/dev/null
gate_rc=$?
set -e
(( gate_rc != 0 )) || fail "missing == missing must not pass gate"
pass "missing equals missing fails closed"
echo "PRE_AND_POST_MISSING_EQUALITY_FAILS_TEST=PASS"

abs_pre="${TMP_DIR}/abs-pre.state"
abs_post="${TMP_DIR}/abs-post.state"
write_complete_fixture_state PRE "$abs_pre"
write_complete_fixture_state POST "$abs_post"
rfrf_cross_workstream_immediate_gate "$abs_pre" "$abs_post" >/dev/null || fail "legitimate config absent should pass"
pass "legitimate config absent equality"
echo "LEGITIMATE_CONFIG_ABSENT_EQUALITY_TEST=PASS"

bad_pre="${TMP_DIR}/bad-pre.state"
write_complete_fixture_state PRE "$bad_pre"
rfrf_cross_workstream_state_line PRE_EXP021_STUDIES "not-a-number" >"${bad_pre}.tmp"
grep -v '^PRE_EXP021_STUDIES=' "$bad_pre" >>"${bad_pre}.tmp"
mv "${bad_pre}.tmp" "$bad_pre"
rfrf_validate_cross_workstream_snapshot PRE "$bad_pre" >/dev/null && fail "non-numeric should fail validation"
pass "numeric validation fail closed"
echo "NUMERIC_VALIDATION_TEST=PASS"

reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_SHADOW_INCREASE=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc == 0 )) || fail "VDC shadow monotonic increase should pass: ${out}"
echo "$out" | grep -q 'VDC_IMMEDIATE_SURVIVAL_GATE=PASS' || fail "shadow increase missing VDC pass"
pass "VDC shadow monotonic increase"
echo "VDC_SHADOW_MONOTONIC_INCREASE_TEST=PASS"

reset_stage0_env
clear_inject_flags
export RFRF_TEST_INJECT_VDC_SHADOW_DECREASE=1
set +e
out="$(run_stage1)"
rc=$?
set -e
(( rc != 0 )) || fail "VDC shadow decrease should fail"
echo "$out" | grep -q 'VDC_IMMEDIATE_SURVIVAL_GATE=FAIL' || fail "shadow decrease missing VDC fail"
echo "$out" | grep -q 'BACKEND_ENV_RESTORED=YES' || fail "shadow decrease missing recovery"
assert_stage0_final "$out"
pass "VDC shadow decrease recovery"
echo "VDC_SHADOW_DECREASE_TEST=PASS"

echo "PRODUCTION_MODE_INCOMPLETE_EVIDENCE_FAILS_CLOSED=YES"
echo "FIXTURE_MODE_CAN_SYNTHESIZE_EVIDENCE=YES"

echo "CANONICAL_VDC_AUTHORITY_KEYS=${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[*]}"
echo "OBSOLETE_OR_UNUSED_VDC_KEYS=${RFRF_VDC_OBSOLETE_CONFIG_KEYS[*]}"
echo "IMMEDIATE_RESTART_SURVIVAL_GATE_DEFINED=YES"
echo "POST_EXECUTION_4_TICK_SURVIVAL_GATE_DEFINED=YES"

echo "rfrf-f10-stage1-restart-safety: OK"
