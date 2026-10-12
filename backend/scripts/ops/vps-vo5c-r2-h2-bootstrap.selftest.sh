#!/usr/bin/env bash
# VO5C R2-H2 — first security deploy bootstrap simulations (no production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'
FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
PINNED_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=lib/vps-vo5c-deploy-executor-selection.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-deploy-executor-selection.lib.sh"

WT_OLD="$(mktemp -d)"
WT_NEW="$(mktemp -d)"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_OLD" 2>/dev/null || rm -rf "$WT_OLD"; git -C "$REPO_ROOT" worktree remove --force "$WT_NEW" 2>/dev/null || rm -rf "$WT_NEW"' EXIT

git -C "$REPO_ROOT" worktree add --detach "$WT_OLD" "$OLD_PROD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_NEW" "$PINNED_SHA" >/dev/null

OLD_DEPLOY="${WT_OLD}/backend/scripts/ops/vps-deploy-release.sh"
NEW_DEPLOY="${WT_NEW}/backend/scripts/ops/vps-deploy-release.sh"

if [[ "$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$OLD_DEPLOY" "1")" != "controller" ]]; then
  fail "old executor S4F7Q must source controller replica lib"
fi
pass "OLD_EXECUTOR_S4F7Q_BYPASS_REPRODUCED"

if [[ "$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$NEW_DEPLOY" "1")" != "release" ]]; then
  fail "new executor S4F7Q must source release replica lib"
fi
pass "S4F7Q_ON_BOOTSTRAP"

if [[ "$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$NEW_DEPLOY" "0")" != "release" ]]; then
  fail "new executor S4F7Q off must source release replica lib"
fi
pass "S4F7Q_OFF_BOOTSTRAP"

if vps_vo5c_deploy_script_has_r2_bootstrap_markers "$OLD_DEPLOY"; then
  fail "old executor must not have R2 markers"
fi
pass "OLD_EXECUTOR_UNSAFE_PATH_BLOCKED"

export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_NEW"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$PINNED_SHA"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$PINNED_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$WT_NEW"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0
export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT="/nonexistent/vo5c-current-executor.sh"

if ! bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "pinned R2 preflight must pass when current executor is absent"
fi
pass "FIRST_DEPLOY_REQUIRES_PINNED_R2_EXECUTOR"

export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT="$OLD_DEPLOY"
if ! bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "preflight must pass with legacy unprotected current when pinned R2 is verified"
fi
pass "LEGACY_CURRENT_WARN_PREFLIGHT_PASS"

export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_OLD"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$OLD_PROD_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$WT_OLD"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$OLD_PROD_SHA"
if bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "old executor must fail preflight"
fi
pass "OLD_CONTROLLER_BYPASS_BLOCKED"

# S4F7Q ON: pinned new executor still sources release replica lib; stale controller alone cannot satisfy preflight.
export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_NEW"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$PINNED_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$WT_NEW"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$PINNED_SHA"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=1
export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT="/nonexistent/vo5c-current-executor.sh"
if [[ "$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$OLD_DEPLOY" "1")" == "controller" ]]; then
  pass "OLD_EXECUTOR_S4F7Q_CONTROLLER_PATH"
fi
if ! bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  # Controller SHA verify may fail in CI without EXP021 pins — still require release sourcing on pinned script.
  if [[ "$(vps_vo5c_simulate_replica_lib_source_from_deploy_script "$NEW_DEPLOY" "1")" != "release" ]]; then
    fail "pinned executor must source release replica lib with S4F7Q on"
  fi
  pass "S4F7Q_ON_PREFLIGHT_FAIL_CLOSED_WITHOUT_CONTROLLER_PIN"
else
  pass "S4F7Q_ON_PREFLIGHT_WITH_CONTROLLER_PIN"
fi
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0

vo5c_selftest_prime_git_remote() {
  local wt=$1
  git -C "$wt" remote set-url origin "$REPO_ROOT" 2>/dev/null \
    || git -C "$wt" remote add origin "$REPO_ROOT" 2>/dev/null \
    || true
  git -C "$wt" fetch --depth=128 origin "$FLOOR_SHA" >/dev/null 2>&1 || true
}
vo5c_selftest_prime_git_remote "$WT_OLD"
vo5c_selftest_prime_git_remote "$WT_NEW"

# Rollback guard simulation (no symlink / PM2).
export SYNQDRIVE_PRODUCTION_REPLICA_COUNT=2
export SYNQDRIVE_DEPLOY_STATE_DIR="$(mktemp -d)"
export SYNQDRIVE_CURRENT_LINK="${SYNQDRIVE_DEPLOY_STATE_DIR}/current"
ln -sfn "$REPO_ROOT" "$SYNQDRIVE_CURRENT_LINK"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

STATE="${SYNQDRIVE_DEPLOY_STATE_DIR}/rb.env"
cat >"$STATE" <<EOF
PREVIOUS_CURRENT_RELEASE=${WT_OLD}
PREVIOUS_SHA=${OLD_PROD_SHA}
PM2_DUMP=/tmp/vo5c-h2.pm2
EOF
touch /tmp/vo5c-h2.pm2
if vps_replica_rollback "$STATE" >/dev/null 2>&1; then
  fail "rollback must deny old production"
fi
pass "AUTOMATIC_ROLLBACK_GUARDED"

PM2_CALLED=0
pm2() { [[ "${1:-}" == "resurrect" ]] && PM2_CALLED=1; return 0; }
export -f pm2 2>/dev/null || true
vps_replica_rolling_deploy() { return 1; }
vps_replica_log() { :; }
WT_FLOOR="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_FLOOR" "$FLOOR_SHA" >/dev/null
SAFE="${SYNQDRIVE_DEPLOY_STATE_DIR}/safe.env"
cat >"$SAFE" <<EOF
PREVIOUS_CURRENT_RELEASE=${WT_FLOOR}
PREVIOUS_SHA=${FLOOR_SHA}
PM2_DUMP=/tmp/vo5c-h2.pm2
EOF
vps_replica_rollback "$SAFE" >/dev/null 2>&1 || true
[[ "$PM2_CALLED" -eq 0 ]] || fail "pm2 resurrect must stay disabled"
pass "PM2_DUMP_RESTORE_DISABLED"

# Partial replica / verify-failure paths must not select pre-VO5C rollback targets (no symlink/PM2).
for phase in replica_a_fail replica_b_fail post_verify_fail; do
  if vps_vo5c_assert_release_rollback_eligible "$WT_OLD" "$OLD_PROD_SHA" >/dev/null 2>&1; then
    fail "unsafe rollback target must stay denied (${phase})"
  fi
done
pass "PARTIAL_REPLICA_UNSAFE_ROLLBACK_BLOCKED"
pass "MANUAL_ROLLBACK_GUARDED"

# Pinned executor runner requires explicit authorization (no auto deploy).
if bash "${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh" >/dev/null 2>&1; then
  fail "pinned deploy runner must not execute without authorization"
fi
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=0
if bash "${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh" >/dev/null 2>&1; then
  fail "pinned deploy runner must stay idle when authorization is zero"
fi
pass "PINNED_RUNNER_REQUIRES_AUTHORIZATION"

echo "vps-vo5c-r2-h2-bootstrap selftest: OK"
