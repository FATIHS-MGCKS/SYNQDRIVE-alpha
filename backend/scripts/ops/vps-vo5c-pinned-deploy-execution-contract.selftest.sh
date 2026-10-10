#!/usr/bin/env bash
# DSRG-01 — pinned deploy runner must invoke git-clean (non-executable) vps-deploy-release.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
RUNNER="${SCRIPT_DIR}/vps-vo5c-run-pinned-security-deploy.sh"
DEPLOY_REL="backend/scripts/ops/vps-deploy-release.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

git_mode="$(git -C "$REPO_ROOT" ls-files -s "$DEPLOY_REL" | awk '{print $1}')"
if [[ "$git_mode" != "100644" ]]; then
  fail "expected git mode 100644 for ${DEPLOY_REL}, got ${git_mode:-missing}"
fi
pass "DEPLOY_SCRIPT_TRACKED_NON_EXECUTABLE"

if ! grep -q 'exec bash "\$PINNED_DEPLOY_SCRIPT"' "$RUNNER"; then
  fail "pinned runner must exec bash on PINNED_DEPLOY_SCRIPT (git-clean 100644 contract)"
fi
if grep -qE 'exec "\$PINNED_DEPLOY_SCRIPT"' "$RUNNER"; then
  fail "pinned runner must not bare-exec non-executable deploy script"
fi
pass "RUNNER_USES_BASH_EXEC"

WT="$(mktemp -d)"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"' EXIT
git -C "$REPO_ROOT" worktree add --detach "$WT" HEAD >/dev/null
DEPLOY="${WT}/${DEPLOY_REL}"
chmod 644 "$DEPLOY"
if [[ -n "$(git -C "$WT" status --porcelain -- "$DEPLOY_REL")" ]]; then
  fail "chmod must not dirty ops tree in integrity contract test"
fi

STUB="${WT}/backend/scripts/ops/.dsrg01-exec-stub.sh"
cat >"$STUB" <<'EOF'
#!/usr/bin/env bash
echo DSRG01_PINNED_DEPLOY_INVOKED=1
exit 0
EOF
chmod 644 "$STUB"
cp -a "$DEPLOY" "${DEPLOY}.real"
cp -a "$STUB" "$DEPLOY"

PINNED_DEPLOY_SCRIPT="$DEPLOY"
if "$PINNED_DEPLOY_SCRIPT" >/dev/null 2>&1; then
  fail "bare exec of mode-644 deploy path must not succeed"
fi
pass "BARE_EXEC_DENIED_ON_MODE_644"

if ! bash "$PINNED_DEPLOY_SCRIPT" >/dev/null 2>&1; then
  fail "bash invocation of mode-644 deploy path must succeed"
fi
pass "BASH_INVOCATION_ALLOWED_ON_MODE_644"

mv "${DEPLOY}.real" "$DEPLOY"
pass "EXECUTION_CONTRACT_SELFTEST_OK"
echo "vps-vo5c-pinned-deploy-execution-contract selftest: OK"
