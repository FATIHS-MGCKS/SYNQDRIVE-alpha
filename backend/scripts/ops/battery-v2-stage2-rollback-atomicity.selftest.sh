#!/usr/bin/env bash
# Atomic rollback + PKG-01 valid backlog gate selftests for Stage-2 cutover.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"
# shellcheck source=lib/battery-v2-stage2-cutover-test-harness.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover-test-harness.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export BATTERY_V2_STAGE2_TEST_STATE_DIR="$WORK/state"
export BATTERY_V2_OPS_SCRIPT_DIR="$SCRIPT_DIR"
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
mkdir -p "$BATTERY_V2_STAGE2_TEST_STATE_DIR"

BACKEND_ENV="$WORK/backend.env"
BACKUP_FILE="$WORK/backend.env.bak"
CURRENT="$WORK/current"
mkdir -p "$CURRENT"
git -C "$CURRENT" init -q
git -C "$CURRENT" commit --allow-empty -q -m init
TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD)"

write_old_env() {
  cat >"$BACKEND_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
EOF
  cp "$BACKEND_ENV" "$BACKUP_FILE"
  chmod 600 "$BACKEND_ENV" "$BACKUP_FILE"
}

write_stage2_env() {
  cat >"$BACKEND_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
EOF
  chmod 600 "$BACKEND_ENV"
}

# PKG-01 valid backlog gate matrix
battery_v2_stage2_pkg01_preflight_backlog_gate 0 0 | grep -q 'PKG01_PRE_T0_VALID_BACKLOG_GATE=PASS' \
  || fail "VALID=0 UNRESOLVED=0 should PASS"
if battery_v2_stage2_pkg01_preflight_backlog_gate 1 0 >/dev/null 2>&1; then
  fail "VALID=1 should FAIL"
fi
if battery_v2_stage2_pkg01_preflight_backlog_gate 0 1 >/dev/null 2>&1; then
  fail "UNRESOLVED=1 should FAIL"
fi

# A. failure before any replica restart
battery_v2_stage2_test_reset_state
write_old_env
cp "$BACKEND_ENV" "$BACKUP_FILE"
write_stage2_env
export BATTERY_V2_STAGE2_TEST_FAIL_AT=pre_deploy
unset BATTERY_V2_STAGE2_ROLLBACK_PHASE BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL
if battery_v2_stage2_rolling_deploy "$CURRENT" "$TARGET_SHA" 2>/dev/null; then
  fail "A: forward deploy should fail before replica restart"
fi
if ! battery_v2_stage2_execute_atomic_env_rollback "$BACKEND_ENV" "$BACKUP_FILE" "$CURRENT" "$TARGET_SHA" | tee "$WORK/a.log"; then
  fail "A: atomic rollback should succeed"
fi
grep -q 'ROLLBACK_RUNTIME_VERIFIED=YES' "$WORK/a.log" || fail "A: atomic rollback should verify runtime"
grep -q 'ROLLBACK_ENV_RESTORED=YES' "$WORK/a.log" || fail "A: env restored"
grep -q 'ROLLBACK_REPLICAS_RESTARTED=YES' "$WORK/a.log" || fail "A: replicas restarted"
[[ "$(battery_v2_stage2_test_read_state replica_a_config)" == "old" ]] || fail "A: replica A old config"
[[ "$(battery_v2_stage2_test_read_state replica_b_config)" == "old" ]] || fail "A: replica B old config"

# B. replica A stage2, B not restarted → rollback restarts BOTH
battery_v2_stage2_test_reset_state
write_old_env
write_stage2_env
export BATTERY_V2_STAGE2_TEST_FAIL_AT=after_replica_a
unset BATTERY_V2_STAGE2_ROLLBACK_PHASE BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL
if battery_v2_stage2_rolling_deploy "$CURRENT" "$TARGET_SHA" 2>/dev/null; then
  fail "B: forward deploy should fail after replica A"
fi
[[ "$(battery_v2_stage2_test_read_state replica_a_config)" == "stage2" ]] || fail "B: A should be stage2 before rollback"
if ! battery_v2_stage2_execute_atomic_env_rollback "$BACKEND_ENV" "$BACKUP_FILE" "$CURRENT" "$TARGET_SHA" | tee "$WORK/b.log"; then
  fail "B: rollback runtime not verified"
fi
grep -q 'ROLLBACK_RUNTIME_VERIFIED=YES' "$WORK/b.log" || fail "B: rollback runtime not verified"
[[ "$(battery_v2_stage2_test_read_state replica_a_config)" == "old" ]] || fail "B: A rolled back"
[[ "$(battery_v2_stage2_test_read_state replica_b_config)" == "old" ]] || fail "B: B rolled back"
[[ "$(battery_v2_stage2_test_read_state rollback_restarts)" == "2" ]] || fail "B: both replicas restarted on rollback"

# C. both replicas restart, post-deploy verify fails → rollback + scheduler reverify
battery_v2_stage2_test_reset_state
write_old_env
write_stage2_env
export BATTERY_V2_STAGE2_TEST_FAIL_AT=post_deploy_verify
unset BATTERY_V2_STAGE2_ROLLBACK_PHASE BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL
battery_v2_stage2_rolling_deploy "$CURRENT" "$TARGET_SHA" || fail "C: forward deploy should succeed"
if battery_v2_stage2_verify_post_deploy "$CURRENT" "$TARGET_SHA" 2>/dev/null; then
  fail "C: post-deploy verify should fail"
fi
battery_v2_stage2_execute_atomic_env_rollback "$BACKEND_ENV" "$BACKUP_FILE" "$CURRENT" "$TARGET_SHA" | tee "$WORK/c.log"
grep -q 'ROLLBACK_SCHEDULER_CONVERGED=YES' "$WORK/c.log" || fail "C: scheduler should re-converge on rollback"
grep -q 'ROLLBACK_RUNTIME_VERIFIED=YES' "$WORK/c.log" || fail "C: runtime should be verified"

# D. automatic rollback restart fails
battery_v2_stage2_test_reset_state
write_old_env
write_stage2_env
export BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL=yes
unset BATTERY_V2_STAGE2_ROLLBACK_PHASE
if battery_v2_stage2_execute_atomic_env_rollback "$BACKEND_ENV" "$BACKUP_FILE" "$CURRENT" "$TARGET_SHA" 2>&1 | tee "$WORK/d.log"; then
  fail "D: rollback should fail when restart fails"
fi
if grep -q 'ROLLBACK_RUNTIME_VERIFIED=YES' "$WORK/d.log"; then
  fail "D: must not report runtime verified"
fi
grep -q 'ROLLBACK_RUNTIME_VERIFIED=NO' "$WORK/d.log" || fail "D: runtime verified NO"

# E. successful activation emits T0 only after full success (harnessed activation script)
battery_v2_stage2_test_reset_state
unset BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL
TMP_ENV="$WORK/activation.env"
cat >"$TMP_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
DATABASE_URL=postgresql://invalid
EOF
MOCK_BIN="$WORK/bin"
mkdir -p "$MOCK_BIN"
cat >"$MOCK_BIN/psql" <<'EOF'
#!/usr/bin/env bash
echo "24|0|24|0"
EOF
chmod +x "$MOCK_BIN/psql"
export PATH="$MOCK_BIN:$PATH"
export BACKEND_ENV="$TMP_ENV"
export BATTERY_V2_STAGE2_TEST_HARNESS=1
export BATTERY_V2_STAGE2_TEST_FAIL_AT=success
unset BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL BATTERY_V2_STAGE2_ROLLBACK_PHASE
export BATTERY_V2_STAGE2_PREFLIGHT_ACK=YES
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
export SYNQDRIVE_CURRENT_LINK="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUT="$WORK/e.log"
if ! bash "${SCRIPT_DIR}/vps-enable-battery-v2-stage2-production.sh" >"$OUT" 2>&1; then
  cat "$OUT" >&2
  fail "E: successful activation should exit 0"
fi
grep -q 'BATTERY_V2_STAGE2_T0=' "$OUT" || fail "E: T0 emitted on success"
grep -q 'ATOMIC_ROLLBACK_SUCCESSFUL=YES' "$OUT" && fail "E: rollback must not run on success"

# E-fail: partial activation must not emit T0
battery_v2_stage2_test_reset_state
cat >"$TMP_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
DATABASE_URL=postgresql://invalid
EOF
export BACKEND_ENV="$TMP_ENV"
export BATTERY_V2_STAGE2_TEST_FAIL_AT=after_replica_a
unset BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL BATTERY_V2_STAGE2_ROLLBACK_PHASE
if bash "${SCRIPT_DIR}/vps-enable-battery-v2-stage2-production.sh" >"$WORK/ef.log" 2>&1; then
  cat "$WORK/ef.log" >&2
  fail "E-fail: partial activation should exit non-zero"
fi
grep -q 'BATTERY_V2_STAGE2_T0=' "$WORK/ef.log" && fail "E-fail: T0 must not be emitted on partial failure"
grep -q 'ROLLBACK_RUNTIME_VERIFIED=YES' "$WORK/ef.log" || fail "E-fail: runtime rollback should be verified"

echo "battery-v2-stage2-rollback-atomicity.selftest: OK"
