#!/usr/bin/env bash
# VO5C — shallow git clone ancestry verification (isolated).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'
DESCENDANT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
UNRELATED_SHA='0000000000000000000000000000000000000001'

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"

export VO5C_SECURITY_FLOOR_SHA='0000000000000000000000000000000000000001'
if [[ "$(vps_vo5c_security_floor_sha)" != "$FLOOR_SHA" ]]; then
  fail "env override must not change pinned floor"
fi
pass "IMMUTABLE_FLOOR_PRESERVED"
unset VO5C_SECURITY_FLOOR_SHA

clone_shallow() {
  local sha=$1
  local dest=$2
  git clone --depth 1 --branch "$sha" "file://${REPO_ROOT}" "$dest" 2>/dev/null || {
    git clone "file://${REPO_ROOT}" "$dest" >/dev/null
    git -C "$dest" checkout -q "$sha" >/dev/null
    git -C "$dest" repack -adf >/dev/null 2>&1 || true
  }
}

WT_FLOOR="$(mktemp -d)"
clone_shallow "$FLOOR_SHA" "$WT_FLOOR"
if ! vps_vo5c_assert_release_rollback_eligible "$WT_FLOOR" "$FLOOR_SHA" >/dev/null 2>&1; then
  fail "shallow floor should be allowed"
fi
pass "SHALLOW_SECURITY_FLOOR_ALLOWED"

WT_DESC="$(mktemp -d)"
clone_shallow "$DESCENDANT_SHA" "$WT_DESC"
if ! vps_vo5c_assert_release_rollback_eligible "$WT_DESC" >/dev/null 2>&1; then
  fail "shallow safe descendant should be allowed after reconstruction"
fi
pass "SHALLOW_SAFE_DESCENDANT_ALLOWED"

WT_OLD="$(mktemp -d)"
clone_shallow "$OLD_PROD_SHA" "$WT_OLD"
if vps_vo5c_assert_release_rollback_eligible "$WT_OLD" "$OLD_PROD_SHA" >/dev/null 2>&1; then
  fail "shallow pre-floor must be denied"
fi
pass "SHALLOW_UNSAFE_ANCESTOR_DENIED"

if vps_vo5c_assert_release_rollback_eligible "$WT_DESC" "$UNRELATED_SHA" >/dev/null 2>&1; then
  fail "unrelated sha must be denied"
fi
pass "SHALLOW_UNKNOWN_ANCESTRY_DENIED"

rm -rf "$WT_FLOOR" "$WT_DESC" "$WT_OLD"
echo "vps-vo5c-shallow-ancestry selftest: OK"
