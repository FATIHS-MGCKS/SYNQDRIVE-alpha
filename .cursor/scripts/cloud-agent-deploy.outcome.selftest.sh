#!/usr/bin/env bash
# Offline outcome tests for cloud-agent-deploy.sh (mocked SSH/curl/gh; no production connectivity).
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

write_mock_gh_ci_ok() {
  cat >"${MOCK_BIN}/gh" <<'EOS'
#!/usr/bin/env bash
if [[ "$*" == *check-runs* ]]; then
  echo '{"total_count":1,"check_runs":[{"name":"CI gate (all critical jobs)","status":"completed","conclusion":"success","started_at":"2026-10-12T12:00:00Z","completed_at":"2026-10-12T12:01:00Z"}]}'
  exit 0
fi
exec /usr/bin/gh "$@"
EOS
  chmod +x "${MOCK_BIN}/gh"
}

write_mock_ssh() {
  local remote_rc=$1
  cat >"${MOCK_BIN}/ssh" <<'EOS'
#!/usr/bin/env bash
if [[ "$*" == *"echo ok"* ]]; then
  exit 0
fi
if [[ "$*" == *"DEPLOY_SCRIPT_MISSING"* ]] || [[ "$*" == *"test -f"* ]]; then
  echo DEPLOY_SCRIPT_OK
  exit 0
fi
if [[ "$*" == *"vps-deploy-release.sh"* ]] || [[ "$*" == *"SYNQDRIVE_REQUESTED_DEPLOY_SHA"* ]]; then
  exit "${MOCK_SSH_REMOTE_RC:-0}"
fi
echo "FAIL: unexpected ssh invocation: $*" >&2
exit 99
EOS
  chmod +x "${MOCK_BIN}/ssh"
  export MOCK_SSH_REMOTE_RC="$remote_rc"
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
    CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 \
    CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" \
    CLOUD_AGENT_VPS_HOST=mock.example \
    bash "$DEPLOY" "$@" 2>&1
}

write_mock_gh_ci_ok
write_mock_ssh 0

# Owner ack required (exit 41)
set +e
out=$(PATH="${MOCK_BIN}:${PATH}" CLOUD_AGENT_SKIP_VPS_VERIFY=1 CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" CLOUD_AGENT_VPS_HOST=mock.example \
  bash "$DEPLOY" 2>&1)
rc=$?
set -e
[[ "$rc" -eq 41 ]] && echo "$out" | grep -q 'owner instruction' && pass owner_deploy_ack_required_exit_41

# Deploy script missing (exit 46)
cat >"${MOCK_BIN}/ssh" <<'EOS'
#!/usr/bin/env bash
if [[ "$*" == *"test -f"* ]]; then
  echo DEPLOY_SCRIPT_MISSING
  exit 0
fi
exit 99
EOS
chmod +x "${MOCK_BIN}/ssh"
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 46 ]] && echo "$out" | grep -q 'deploy script missing' && pass deploy_script_missing_exit_46

write_mock_ssh 3
write_mock_curl_ok
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 3 ]] && echo "$out" | grep -q 'PARTIAL_SUCCESS' && pass remote_partial_success_exit_3

write_mock_ssh 0
write_mock_curl_fail
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 2 ]] && echo "$out" | grep -q 'public_health=FAIL' && pass public_health_fail_exit_2

write_mock_ssh 0
write_mock_curl_ok
set +e
out=$(run_deploy 2>&1)
rc=$?
set -e
[[ "$rc" -eq 0 ]] && echo "$out" | grep -q 'public_health=OK' && pass release_ok_public_health_ok

cat >"${MOCK_BIN}/ssh" <<'EOS'
#!/usr/bin/env bash
if [[ "$*" == *"echo ok"* ]]; then
  exit 0
fi
if [[ "$*" == *"test -f"* ]]; then
  echo DEPLOY_SCRIPT_OK
  exit 0
fi
if [[ "$*" == *"sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA="* ]]; then
  echo SUDO_RELEASE_INVOKE_OK
  exit 0
fi
echo "FAIL: unexpected ssh invocation: $*" >&2
exit 99
EOS
chmod +x "${MOCK_BIN}/ssh"
write_mock_gh_ci_ok
write_mock_curl_ok
set +e
out=$(PATH="${MOCK_BIN}:${PATH}" \
  CLOUD_AGENT_SKIP_VPS_VERIFY=1 \
  CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
  CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 \
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$REQUESTED_SHA" \
  CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud \
  CLOUD_AGENT_SSH_STRICT_HOST_KEY=0 \
  bash "$DEPLOY" 2>&1)
rc=$?
set -e
if [[ "$rc" -ne 0 ]] || ! echo "$out" | grep -q 'SUDO_RELEASE_INVOKE_OK'; then
  echo "$out" >&2
  fail 'hostinger_admin_sudo_release_invoke'
fi
pass hostinger_admin_sudo_release_invoke

grep -q 'CLOUD_AGENT_SKIP_CI_GATE' "$DEPLOY" && fail 'ci_gate_bypass_env_still_documented_in_script'
pass ci_gate_non_bypassable_in_script

echo "ALL_CLOUD_AGENT_DEPLOY_OUTCOME_TESTS_PASS"
