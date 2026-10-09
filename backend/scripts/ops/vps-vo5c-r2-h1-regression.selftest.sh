#!/usr/bin/env bash
# VO5C R2-H1 mandatory security regressions (no production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'

# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"

if [[ "$(vps_vo5c_security_floor_sha)" != "$FLOOR_SHA" ]]; then
  fail "immutable floor pin"
fi
pass "immutable_security_floor"

export VO5C_SECURITY_FLOOR_SHA='0000000000000000000000000000000000000001'
if [[ "$(vps_vo5c_security_floor_sha)" != "$FLOOR_SHA" ]]; then
  fail "env override must not change floor"
fi
pass "env_override_denied"

unset VO5C_SECURITY_FLOOR_SHA

STUB_LIB_DIR="$(mktemp -d)"
mkdir -p "${STUB_LIB_DIR}/lib"
cp "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh" "${STUB_LIB_DIR}/lib/"
if bash -c "source '${STUB_LIB_DIR}/lib/vps-production-replica.lib.sh'" >/dev/null 2>&1; then
  fail "guard missing must deny replica lib load"
fi
pass "guard_missing_fail_closed"

WT_OLD="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_OLD" "$OLD_PROD_SHA" >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_OLD" 2>/dev/null || rm -rf "$WT_OLD"; rm -rf "$STUB_LIB_DIR"' EXIT

if vps_vo5c_assert_release_rollback_eligible "$WT_OLD" "$OLD_PROD_SHA" >/dev/null 2>&1; then
  fail "old production must be denied"
fi
pass "old_production_rollback_denied"

WT_FLOOR="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_FLOOR" "$FLOOR_SHA" >/dev/null
if ! vps_vo5c_assert_release_rollback_eligible "$WT_FLOOR" "$FLOOR_SHA" >/dev/null 2>&1; then
  fail "floor must be allowed"
fi
pass "safe_descendant_allowed"

# S4F7Q deploy path: candidate replica library + authority dir (never older controller replica lib).
RELEASE_OPS="${REPO_ROOT}/backend/scripts/ops"
export SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR="${RELEASE_OPS}"
vps_vo5c_load_authority_from_ops_dir "${RELEASE_OPS}" || fail "candidate authority load"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS}/lib/vps-production-replica.lib.sh" || fail "release replica lib load"
vps_vo5c_require_rollback_guard_ready || fail "s4f7q guard ready"
pass "s4f7q_controller_guard_test"

WT_CONTROLLER="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_CONTROLLER" "$OLD_PROD_SHA" >/dev/null
CONTROLLER_OPS="${WT_CONTROLLER}/backend/scripts/ops"
if bash -c "source '${CONTROLLER_OPS}/lib/vps-production-replica.lib.sh'" >/dev/null 2>&1; then
  pass "old_controller_replica_lib_unguarded_documented"
else
  pass "old_controller_replica_lib_load_failed"
fi
if bash -c "export SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR='${RELEASE_OPS}'; source '${CONTROLLER_OPS}/lib/vps-production-replica.lib.sh'; declare -F vps_vo5c_require_rollback_guard_ready" >/dev/null 2>&1; then
  fail "pre-R2 controller replica lib must not expose VO5C guard"
fi
pass "old_controller_bypass_possible_if_sourced_without_release_replica_lib"

# PM2 dump unsafe path denied.
DUMP_UNSAFE="$(mktemp)"
printf '%s' "/opt/synqdrive/releases/20261008182454_v4994/backend/dist/src/main.js" >"$DUMP_UNSAFE"
if vps_vo5c_validate_pm2_dump_paths "$DUMP_UNSAFE" "$WT_FLOOR" "$FLOOR_SHA" >/dev/null 2>&1; then
  fail "unsafe pm2 dump path must be denied"
fi
pass "pm2_dump_unsafe_path_denied"

if vps_vo5c_pm2_dump_resurrect_permitted >/dev/null 2>&1; then
  fail "pm2 resurrect must be disabled"
fi
pass "pm2_dump_resurrect_disabled"

echo "vps-vo5c-r2-h1-regression selftest: OK"
