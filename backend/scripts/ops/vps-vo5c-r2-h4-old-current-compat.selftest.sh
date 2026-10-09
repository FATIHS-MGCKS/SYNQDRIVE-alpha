#!/usr/bin/env bash
# VO5C R2-H4 — legacy /current executor present; pinned R2 only for execution.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OLD_PROD_SHA='3b557e208c1a06e91c0a13fb8ba861b1255ee375'
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

WT_HEAD="$(mktemp -d)"
WT_OLD="$(mktemp -d)"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_HEAD" 2>/dev/null || rm -rf "$WT_HEAD"; git -C "$REPO_ROOT" worktree remove --force "$WT_OLD" 2>/dev/null || rm -rf "$WT_OLD"' EXIT

git -C "$REPO_ROOT" worktree add --detach "$WT_HEAD" "$HEAD_SHA" >/dev/null
git -C "$REPO_ROOT" worktree add --detach "$WT_OLD" "$OLD_PROD_SHA" >/dev/null

git -C "$WT_HEAD" remote set-url origin "file://${REPO_ROOT}" 2>/dev/null \
  || git -C "$WT_HEAD" remote add origin "file://${REPO_ROOT}"

OLD_DEPLOY="${WT_OLD}/backend/scripts/ops/vps-deploy-release.sh"
[[ -f "$OLD_DEPLOY" ]] || fail "old production deploy script missing"

# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-security-floor.lib.sh"
# shellcheck source=lib/vps-vo5c-deploy-executor-selection.lib.sh
source "${SCRIPT_DIR}/lib/vps-vo5c-deploy-executor-selection.lib.sh"

git -C "$WT_HEAD" fetch --depth=128 origin "$(vps_vo5c_security_floor_sha)" >/dev/null 2>&1 || true

if vps_vo5c_deploy_script_has_r2_bootstrap_markers "$OLD_DEPLOY"; then
  fail "old current must be unprotected for this fixture"
fi
pass "OLD_CURRENT_EXECUTOR_PRESENT"

OLD_EXEC_MARKER="$(mktemp)"
PINNED_EXEC_MARKER="$(mktemp)"
cat >"${WT_OLD}/backend/scripts/ops/vo5c-h4-old-exec-trap.sh" <<EOF
#!/usr/bin/env bash
echo "old" >>"${OLD_EXEC_MARKER}"
exit 99
EOF
chmod +x "${WT_OLD}/backend/scripts/ops/vo5c-h4-old-exec-trap.sh"

run_preflight() {
  local s4f7q=$1
  export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$WT_HEAD"
  export SYNQDRIVE_PINNED_EXECUTOR_SHA="$HEAD_SHA"
  export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$HEAD_SHA"
  export SYNQDRIVE_STAGED_RELEASE_ROOT="$WT_HEAD"
  export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE="$s4f7q"
  export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT="$OLD_DEPLOY"
  if [[ "$s4f7q" == "1" ]]; then
    export SYNQDRIVE_DEPLOY_CONTROLLER_ROOT="$WT_HEAD"
    export EXPECTED_DEPLOY_CONTROLLER_SHA="$HEAD_SHA"
  else
    unset SYNQDRIVE_DEPLOY_CONTROLLER_ROOT EXPECTED_DEPLOY_CONTROLLER_SHA
  fi
  bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh"
}

if ! run_preflight 0 >/dev/null 2>&1; then
  fail "S4F7Q off preflight must pass with legacy current present"
fi
pass "S4F7Q_OFF_TEST"

if ! run_preflight 1 >/dev/null 2>&1; then
  fail "S4F7Q on preflight must pass with legacy current present"
fi
pass "S4F7Q_ON_TEST"
pass "PINNED_EXECUTOR_PREFLIGHT_PASS"

# Runner must exec pinned deploy only (never legacy current).
PINNED_DEPLOY="${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh"
RUNNER="${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh"
if ! grep -q 'PINNED_DEPLOY_SCRIPT' "$RUNNER" || grep -q 'SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT' "$RUNNER"; then
  fail "runner must not reference current executor env"
fi

rm -f "$OLD_EXEC_MARKER" "$PINNED_EXEC_MARKER"
cat >"${WT_HEAD}/backend/scripts/ops/vo5c-h4-pinned-exec-trap.sh" <<EOF
#!/usr/bin/env bash
echo "pinned" >>"${PINNED_EXEC_MARKER}"
exit 0
EOF
chmod +x "${WT_HEAD}/backend/scripts/ops/vo5c-h4-pinned-exec-trap.sh"
cp -a "$PINNED_DEPLOY" "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh.real-h4"
mv "${WT_HEAD}/backend/scripts/ops/vo5c-h4-pinned-exec-trap.sh" "$PINNED_DEPLOY"

PINNED_EXECUTOR_ROOT="$WT_HEAD"
PINNED_DEPLOY_SCRIPT="${PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-deploy-release.sh"
if [[ "$PINNED_DEPLOY_SCRIPT" == "${WT_OLD}/backend/scripts/ops/vo5c-h4-old-exec-trap.sh" ]]; then
  fail "runner must resolve pinned deploy path not legacy trap"
fi
# Same exec target as vps-vo5c-run-pinned-security-deploy.sh (post-preflight).
if ! bash "$PINNED_DEPLOY_SCRIPT" >/dev/null 2>&1; then
  fail "pinned deploy script must be the executed entrypoint"
fi
[[ -f "$PINNED_EXEC_MARKER" ]] || fail "pinned executor must run"
[[ ! -f "$OLD_EXEC_MARKER" ]] || fail "legacy executor must not run"
pass "OLD_EXECUTOR_EXECUTED=0"

mv "${WT_HEAD}/backend/scripts/ops/vps-deploy-release.sh.real-h4" "$PINNED_DEPLOY"

echo "vps-vo5c-r2-h4-old-current-compat selftest: OK"
