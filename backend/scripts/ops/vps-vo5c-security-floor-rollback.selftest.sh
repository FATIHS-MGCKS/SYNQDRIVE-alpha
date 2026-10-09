#!/usr/bin/env bash
# VO5C security-floor rollback guard — isolated negative/positive matrix (no production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

export SYNQDRIVE_PRODUCTION_REPLICA_COUNT=2
export SYNQDRIVE_DEPLOY_STATE_DIR="$(mktemp -d)"
export SYNQDRIVE_DEPLOY_CORRELATION_ID="vo5c-selftest-$(date +%s)"
export SYNQDRIVE_CURRENT_LINK="${SYNQDRIVE_DEPLOY_STATE_DIR}/current"
ln -sfn "${REPO_ROOT}" "${SYNQDRIVE_CURRENT_LINK}"
trap 'rm -rf "${SYNQDRIVE_DEPLOY_STATE_DIR}"' EXIT

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

assert_denied() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    fail "${label} expected DENIED"
  fi
  pass "${label} denied"
}

assert_allowed() {
  local label=$1
  shift
  if ! "$@" >/dev/null 2>&1; then
    fail "${label} expected ALLOWED"
  fi
  pass "${label} allowed"
}

make_release_worktree() {
  local sha=$1
  local dest=$2
  git -C "$REPO_ROOT" worktree add --detach "$dest" "$sha" >/dev/null
}

cleanup_worktree() {
  local dest=$1
  git -C "$REPO_ROOT" worktree remove --force "$dest" >/dev/null 2>&1 || rm -rf "$dest"
}

WT_BASE="$(mktemp -d)"
trap 'for d in "$WT_BASE"/*; do [[ -d "$d" ]] && cleanup_worktree "$d" || true; done; rm -rf "$WT_BASE"' EXIT

FLOOR_SHA="$(vps_vo5c_security_floor_sha)"
OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'
OLDER_SHA='54fc704fb50c285c68470d8fa274d72a67438482'

WT_OLD="${WT_BASE}/old-prod"
make_release_worktree "$OLD_PROD_SHA" "$WT_OLD"
assert_denied "old_production_sha" vps_vo5c_assert_release_rollback_eligible "$WT_OLD" "$OLD_PROD_SHA"

WT_OLDER="${WT_BASE}/older"
make_release_worktree "$OLDER_SHA" "$WT_OLDER"
assert_denied "older_production_sha" vps_vo5c_assert_release_rollback_eligible "$WT_OLDER" "$OLDER_SHA"

WT_FLOOR="${WT_BASE}/floor"
make_release_worktree "$FLOOR_SHA" "$WT_FLOOR"
assert_allowed "security_floor_sha" vps_vo5c_assert_release_rollback_eligible "$WT_FLOOR" "$FLOOR_SHA"

WT_HEAD="${WT_BASE}/head"
make_release_worktree "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$WT_HEAD"
assert_allowed "safe_descendant_head" vps_vo5c_assert_release_rollback_eligible "$WT_HEAD"

WT_MISMATCH="${WT_BASE}/mismatch"
make_release_worktree "$FLOOR_SHA" "$WT_MISMATCH"
assert_denied "mismatched_claimed_sha" vps_vo5c_assert_release_rollback_eligible "$WT_MISMATCH" "0000000000000000000000000000000000000001"

assert_denied "missing_release_directory" vps_vo5c_assert_release_rollback_eligible "/nonexistent/vo5c-release" "$FLOOR_SHA"

SHALLOW_DIR="$(mktemp -d "${WT_BASE}/shallow.XXXX")"
rm -rf "$SHALLOW_DIR"
mkdir -p "$SHALLOW_DIR"
git -C "$SHALLOW_DIR" init -q
git -C "$SHALLOW_DIR" remote add origin "file://${REPO_ROOT}"
git -C "$SHALLOW_DIR" fetch --depth=1 origin "$OLD_PROD_SHA"
git -C "$SHALLOW_DIR" checkout -q FETCH_HEAD
if ! vps_vo5c_assert_release_rollback_eligible "$SHALLOW_DIR" "$OLD_PROD_SHA" >/dev/null 2>&1; then
  pass "shallow_or_old_history_denied"
else
  fail "shallow_or_old_history should be denied"
fi

STATE_FILE="${SYNQDRIVE_DEPLOY_STATE_DIR}/rollback-test.env"
cat >"$STATE_FILE" <<EOF
PREVIOUS_CURRENT_RELEASE=${WT_OLD}
PREVIOUS_SHA=${OLD_PROD_SHA}
CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PM2_DUMP=/tmp/vo5c-fake-dump.pm2
REPLICA_COUNT=2
EOF
touch /tmp/vo5c-fake-dump.pm2

CURRENT_BEFORE="$(readlink -f "${SYNQDRIVE_CURRENT_LINK}" 2>/dev/null || echo "")"
if ! vps_replica_rollback "$STATE_FILE" >/dev/null 2>&1; then
  pass "manual_automatic_rollback_entry_denied_old_prod"
else
  fail "vps_replica_rollback should deny old production"
fi
CURRENT_AFTER="$(readlink -f "${SYNQDRIVE_CURRENT_LINK}" 2>/dev/null || echo "")"
if [[ -n "$CURRENT_BEFORE" && "$CURRENT_BEFORE" != "$CURRENT_AFTER" ]]; then
  fail "symlink must not change on denied rollback"
fi
pass "symlink_restore_protected_on_denied_rollback"

PM2_RESURRECT_CALLED=0
pm2() {
  if [[ "${1:-}" == "resurrect" ]]; then
    PM2_RESURRECT_CALLED=1
  fi
  return 0
}
export -f pm2 2>/dev/null || true

# Rolling deploy stub: force failure after eligibility passed (floor worktree).
vps_replica_rolling_deploy() { return 1; }
vps_replica_verify_post_deploy() { return 0; }
vps_replica_log() { :; }

SAFE_STATE="${SYNQDRIVE_DEPLOY_STATE_DIR}/safe-rollback.env"
cat >"$SAFE_STATE" <<EOF
PREVIOUS_CURRENT_RELEASE=${WT_FLOOR}
PREVIOUS_SHA=${FLOOR_SHA}
CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PM2_DUMP=/tmp/vo5c-fake-dump.pm2
REPLICA_COUNT=2
EOF
PM2_RESURRECT_CALLED=0
if vps_replica_rollback "$SAFE_STATE" >/dev/null 2>&1; then
  fail "expected rolling deploy failure path"
fi
if [[ "$PM2_RESURRECT_CALLED" -eq 1 ]]; then
  fail "pm2 resurrect must remain disabled"
fi
pass "pm2_dump_resurrect_disabled_on_rollback_failure"

echo "vps-vo5c-security-floor-rollback selftest: OK"
