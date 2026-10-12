#!/usr/bin/env bash
# VO5C R2-H3 — deploy target admission, executor integrity, S4F7Q positive path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"
# shellcheck source=lib/vps-vo5c-deploy-admission.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-deploy-admission.lib.sh"

WT_HEAD="$(mktemp -d)"
WT_OLD="$(mktemp -d)"
WT_FLOOR="$(mktemp -d)"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_HEAD" 2>/dev/null || rm -rf "$WT_HEAD"; git -C "$REPO_ROOT" worktree remove --force "$WT_OLD" 2>/dev/null || rm -rf "$WT_OLD"; git -C "$REPO_ROOT" worktree remove --force "$WT_FLOOR" 2>/dev/null || rm -rf "$WT_FLOOR"' EXIT

git -C "$REPO_ROOT" worktree add --detach "$WT_HEAD" "$HEAD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_OLD" "$OLD_PROD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_FLOOR" "$FLOOR_SHA" >/dev/null

vo5c_prime_remote() {
  git -C "$1" remote set-url origin "file://${REPO_ROOT}" 2>/dev/null \
    || git -C "$1" remote add origin "file://${REPO_ROOT}"
  git -C "$1" fetch --depth=128 origin "$FLOOR_SHA" >/dev/null 2>&1 || true
}
vo5c_prime_remote "$REPO_ROOT"
vo5c_prime_remote "$WT_HEAD"
vo5c_prime_remote "$WT_OLD"

if vps_vo5c_assert_deploy_target_admitted "$WT_HEAD" ""; then
  fail "empty requested sha must be denied"
fi
pass "TARGET_SHA_REQUIRED"

if SYNQDRIVE_REQUESTED_DEPLOY_SHA= bash "${SCRIPT_DIR}/vps-deploy-release.sh" >/dev/null 2>&1; then
  fail "direct deploy without requested sha must abort"
fi
pass "DIRECT_DEPLOY_BYPASS_DENIED"

if vps_vo5c_assert_deploy_target_admitted "$WT_OLD" "$OLD_PROD_SHA" >/dev/null 2>&1; then
  fail "pre-floor target must be denied"
fi
pass "OLD_TARGET_DEPLOY_DENIED"

if ! vps_vo5c_assert_deploy_target_admitted "$WT_HEAD" "$HEAD_SHA" >/dev/null 2>&1; then
  fail "safe target must be admitted"
fi
pass "TARGET_ANCESTRY_REQUIRED"

if ! grep -q 'vps_vo5c_assert_deploy_target_admitted' "${SCRIPT_DIR}/vps-deploy-release.sh"; then
  fail "deploy script must call target admission before migrations"
fi
if ! awk '/vps_clone_release_at_sha/,/prisma:migrate:deploy/' "${SCRIPT_DIR}/vps-deploy-release.sh" | grep -q 'vps_vo5c_assert_deploy_target_admitted'; then
  fail "target admission must precede migrations"
fi
pass "TARGET_CHECK_PRECEDES_MIGRATIONS"

if ! vps_vo5c_verify_executor_tree_integrity "$WT_HEAD" "$HEAD_SHA" >/dev/null 2>&1; then
  fail "clean executor tree must verify"
fi
pass "EXECUTOR_TRACKED_FILES_VERIFIED"

cp "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh" "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh.bak"
echo "# dirty" >>"${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh"
if vps_vo5c_verify_executor_tree_integrity "$WT_HEAD" "$HEAD_SHA" >/dev/null 2>&1; then
  mv "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh.bak" "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh"
  fail "dirty executor must be denied"
fi
mv "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh.bak" "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh"
pass "DIRTY_EXECUTOR_DENIED"

UNTRUSTED="${WT_HEAD}/backend/scripts/ops/lib/vo5c-malicious-exec.sh"
printf '#!/usr/bin/env bash\nexit 0\n' >"$UNTRUSTED"
chmod +x "$UNTRUSTED"
if vps_vo5c_verify_executor_tree_integrity "$WT_HEAD" "$HEAD_SHA" >/dev/null 2>&1; then
  rm -f "$UNTRUSTED"
  fail "untracked executable in ops must be denied"
fi
rm -f "$UNTRUSTED"
pass "UNTRUSTED_EXECUTOR_DENIED"

vo5c_prime_remote "$WT_HEAD"
export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_HEAD"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$HEAD_SHA"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$HEAD_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$WT_HEAD"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0
export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT="/nonexistent/vo5c-current-executor.sh"
if ! bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "S4F7Q off positive preflight must pass"
fi
pass "S4F7Q_OFF_POSITIVE_PREFLIGHT"

export SYNQDRIVE_DEPLOY_CONTROLLER_ROOT="$WT_HEAD"
export EXPECTED_DEPLOY_CONTROLLER_SHA="$HEAD_SHA"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=1
if ! bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "S4F7Q on positive preflight must pass with pinned controller fixture"
fi
pass "S4F7Q_ON_POSITIVE_PREFLIGHT"

export EXPECTED_DEPLOY_CONTROLLER_SHA="$OLD_PROD_SHA"
if bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh" >/dev/null 2>&1; then
  fail "S4F7Q on stale controller must deny"
fi
pass "S4F7Q_ON_NEGATIVE_PREFLIGHT"

RUNNER="${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh"
if ! grep -q 'PINNED_DEPLOY_SCRIPT' "$RUNNER" || grep -q '/opt/synqdrive/current' "$RUNNER"; then
  fail "pinned runner must not invoke /opt/synqdrive/current"
fi
pass "OLD_CURRENT_EXECUTOR_NOT_INVOKED"
pass "PINNED_EXECUTOR_EFFECTIVE"

echo "vps-vo5c-r2-h3-final-closure selftest: OK"
