#!/usr/bin/env bash
# VO5C — production-like shallow git clone ancestry verification (isolated).
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

production_like_shallow_clone() {
  local sha=$1
  local dest=$2
  rm -rf "$dest"
  mkdir -p "$dest"
  git -C "$dest" init -q
  git -C "$dest" remote add origin "file://${REPO_ROOT}"
  git -C "$dest" fetch --depth=1 origin "$sha"
  git -C "$dest" checkout -q FETCH_HEAD
  if [[ "$(git -C "$dest" rev-parse --is-shallow-repository 2>/dev/null)" != "true" ]]; then
    fail "fixture must remain shallow (depth=1) before ancestry reconstruction sha=${sha}"
  fi
}

WT_FLOOR="$(mktemp -d)"
production_like_shallow_clone "$FLOOR_SHA" "$WT_FLOOR"
pass "GENUINE_DEPTH1_FIXTURE"
if ! vps_vo5c_assert_release_rollback_eligible "$WT_FLOOR" "$FLOOR_SHA" >/dev/null 2>&1; then
  fail "shallow floor should be allowed"
fi
pass "SHALLOW_SECURITY_FLOOR_ALLOWED"

WT_DESC="$(mktemp -d)"
production_like_shallow_clone "$DESCENDANT_SHA" "$WT_DESC"
if ! vps_vo5c_assert_release_rollback_eligible "$WT_DESC" >/dev/null 2>&1; then
  fail "shallow safe descendant should be allowed after reconstruction"
fi
pass "SAFE_SHALLOW_DESCENDANT_PASS"

WT_OLD="$(mktemp -d)"
production_like_shallow_clone "$OLD_PROD_SHA" "$WT_OLD"
if vps_vo5c_assert_release_rollback_eligible "$WT_OLD" "$OLD_PROD_SHA" >/dev/null 2>&1; then
  fail "shallow pre-floor must be denied"
fi
pass "UNSAFE_SHALLOW_ANCESTOR_DENIED"

if vps_vo5c_assert_release_rollback_eligible "$WT_DESC" "$UNRELATED_SHA" >/dev/null 2>&1; then
  fail "unrelated sha must be denied"
fi
pass "SHALLOW_UNKNOWN_ANCESTRY_DENIED"

WT_UNAVAIL="$(mktemp -d)"
production_like_shallow_clone "$DESCENDANT_SHA" "$WT_UNAVAIL"
git -C "$WT_UNAVAIL" remote set-url origin "file:///nonexistent-vo5c-shallow-${WT_UNAVAIL##*/}"
export SYNQDRIVE_GIT_REPO="file://${REPO_ROOT}"
if vps_vo5c_assert_release_rollback_eligible "$WT_UNAVAIL" "$DESCENDANT_SHA" >/dev/null 2>&1; then
  unset SYNQDRIVE_GIT_REPO
  fail "unavailable ancestry must be denied when floor history cannot be recovered"
fi
unset SYNQDRIVE_GIT_REPO
pass "UNAVAILABLE_SHALLOW_HISTORY_DENIED"

rm -rf "$WT_FLOOR" "$WT_DESC" "$WT_OLD" "$WT_UNAVAIL"
echo "vps-vo5c-shallow-ancestry selftest: OK"
