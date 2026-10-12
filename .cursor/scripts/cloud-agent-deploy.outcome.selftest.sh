#!/usr/bin/env bash
# Offline outcome tests for cloud-agent-deploy.sh (mocked SSH/curl; no production connectivity).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="${ROOT}/.cursor/scripts/cloud-agent-deploy.sh"
MOCK_BIN="$(mktemp -d)"
MOCK_HOME="$(mktemp -d)"
mkdir -p "${MOCK_HOME}/.ssh"
ssh-keygen -t ed25519 -N "" -f "${MOCK_HOME}/.ssh/id_ed25519" -q
trap 'rm -rf "$MOCK_BIN" "$MOCK_HOME"' EXIT
export HOME="$MOCK_HOME"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

REQUESTED_SHA="$(git -C "$ROOT" rev-parse HEAD)"

write_mock_ssh() {
  local remote_rc=$1
  cat >"${MOCK_BIN}/ssh" <<'EOS'
#!/usr/bin/env bash
if [[ "$*" == *"echo ok"* ]]; then
  exit 0
fi
if [[ -n "${MOCK_SSH_FAIL_BOOTSTRAP_TEST:-}" ]] && [[ "$*" == *"--preflight-check"* ]]; then
  exit 1
fi
if [[ -n "${MOCK_SSH_FAIL_SUDO:-}" ]] && [[ "$*" == sudo* ]]; then
  echo "sudo: a password is required" >&2
  exit 1
fi
if [[ "$*" == *"vo5c-cloud-agent-pinned-deploy-bootstrap.sh"* ]]; then
  :
elif [[ "$*" == *"--preflight-check"* ]]; then
  exit 0
else
  echo "FAIL: unexpected ssh invocation: $*" >&2
  exit 99
fi
exit "${MOCK_SSH_REMOTE_RC:-0}"
EOS
  chmod +x "${MOCK_BIN}/ssh"
  export MOCK_SSH_REMOTE_RC="$remote_rc"
  unset MOCK_SSH_FAIL_BOOTSTRAP_TEST
}

write_mock_curl_fail() {
  cat >"${MOCK_BIN}/curl" <<'EOS'
#!/usr/bin/env bash
exit 1
EOS
  chmod +x "${MOCK_BIN}/curl"
}

write_mock_curl_ok() {
  cat >"${MOCK_BIN}/curl" <<'EOS'
#!/usr/bin/env bash
echo '{"status":"ok"}'
exit 0
EOS
  chmod +x "${MOCK_BIN}/curl"
}

run_deploy() {
  PATH="${MOCK_BIN}:${PATH}" \
    CLOUD_AGENT_SKIP_VPS_VERIFY=1 \
    CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
    CLOUD_AGENT_SKIP_BOOTSTRAP_PREFLIGHT=1 \
    CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" \
    CLOUD_AGENT_VO5C_PIN_ENV=/opt/synqdrive/shared/vo5c-pinned-executor.env \
    CLOUD_AGENT_VO5C_OPERATOR_SESSION_FILE=/opt/synqdrive/shared/vo5c-operator-deploy-session.env \
    CLOUD_AGENT_STAGED_RELEASE_ROOT=/opt/synqdrive/staging-release \
    CLOUD_AGENT_VPS_HOST=mock.example \
    bash "$DEPLOY" "$@" 2>&1
}

# Bootstrap missing on VPS (fail-closed 44)
export MOCK_SSH_FAIL_BOOTSTRAP_TEST=1
write_mock_ssh 0
set +e
out=$(PATH="${MOCK_BIN}:${PATH}" CLOUD_AGENT_SKIP_VPS_VERIFY=1 CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" CLOUD_AGENT_VPS_HOST=mock.example \
  bash "$DEPLOY" 2>&1)
rc=$?
set -e
unset MOCK_SSH_FAIL_BOOTSTRAP_TEST
[[ "$rc" -eq 44 ]] && echo "$out" | grep -q 'bootstrap not installed' && pass bootstrap_missing_exit_44

# Legacy override blocked
set +e
out=$(PATH="${MOCK_BIN}:${PATH}" CLOUD_AGENT_SKIP_VPS_VERIFY=1 CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" \
  CLOUD_AGENT_VPS_DEPLOY_SCRIPT=/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh \
  bash "$DEPLOY" 2>&1)
rc=$?
set -e
[[ "$rc" -ne 0 ]] && echo "$out" | grep -q 'legacy vps-deploy-release.sh is blocked' && pass legacy_deploy_script_blocked

# Exit 42 operator auth
write_mock_ssh 42
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 42 ]] && echo "$out" | grep -q 'human VO5C authorization' && pass remote_missing_auth_exit_42

# Exit 3 partial success preserved
write_mock_ssh 3
write_mock_curl_ok
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 3 ]] && echo "$out" | grep -q 'PARTIAL_SUCCESS' && pass remote_partial_success_exit_3

# Exit 4 monitoring (from remote runner) preserved
write_mock_ssh 4
write_mock_curl_ok
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 4 ]] && pass remote_monitoring_fail_exit_4

# Exit 2 public health after successful remote
write_mock_ssh 0
write_mock_curl_fail
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 2 ]] && echo "$out" | grep -q 'public_health=FAIL' && pass public_health_fail_exit_2

# Successful path
write_mock_ssh 0
write_mock_curl_ok
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 0 ]] && echo "$out" | grep -q 'public_health=OK' && pass pinned_ok_public_health_ok

echo "ALL_CLOUD_AGENT_DEPLOY_OUTCOME_TESTS_PASS"
