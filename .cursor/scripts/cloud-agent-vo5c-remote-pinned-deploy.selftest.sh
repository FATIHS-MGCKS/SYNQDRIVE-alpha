#!/usr/bin/env bash
# Executable offline tests for cloud-agent VO5C remote pinned deploy (mocked; no SSH/VPS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/cloud-agent-vo5c-operator-session.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-operator-session.lib.sh"
# shellcheck source=lib/cloud-agent-vo5c-remote-pinned-deploy.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-remote-pinned-deploy.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SHA_B='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
ARMED='/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed'

ROOT_T="$(mktemp -d)"
trap 'rm -rf "$ROOT_T"' EXIT
export CLOUD_AGENT_VO5C_SESSION_TEST_SKIP_OWNER=1

cloud_agent_vo5c_validate_shared_path '/opt/synqdrive/shared/foo' && pass path_valid_opt
if cloud_agent_vo5c_validate_shared_path '/tmp/evil'; then fail path_outside_opt; else pass path_outside_opt; fi
if cloud_agent_vo5c_validate_shared_path '/opt/synqdrive/$(id)'; then fail path_metachar; else pass path_metachar_reject; fi

export CLOUD_AGENT_VO5C_TEST_SKIP_PATH_ROOT=1

write_session() {
  local file=$1
  local sha=$2
  local until=$3
  : >"$file"
  chmod 600 "$file"
  cat >"$file" <<EOF
SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
AUTHORIZED_REQUESTED_SHA=${sha}
AUTHORIZED_UNTIL_EPOCH=${until}
EOF
}

SESSION_FILE="${ROOT_T}/session.env"
until=$(( $(date -u +%s) + 600 ))
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HEAD_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD)
write_session "$SESSION_FILE" "$HEAD_SHA" "$until"
cloud_agent_vo5c_parse_operator_session_file "$SESSION_FILE" "$HEAD_SHA" && pass session_parse_ok
! cloud_agent_vo5c_parse_operator_session_file "$SESSION_FILE" "$SHA_B" && pass session_wrong_sha

expired=$(( $(date -u +%s) - 60 ))
write_session "${ROOT_T}/sess-expired" "$HEAD_SHA" "$expired"
! cloud_agent_vo5c_parse_operator_session_file "${ROOT_T}/sess-expired" "$HEAD_SHA" && pass session_expired_reject

ttl_far=$(( $(date -u +%s) + 99999 ))
write_session "${ROOT_T}/sess-ttl" "$HEAD_SHA" "$ttl_far"
! cloud_agent_vo5c_parse_operator_session_file "${ROOT_T}/sess-ttl" "$HEAD_SHA" && pass session_ttl_cap_reject

ln -sf "$SESSION_FILE" "${SESSION_FILE}.link"
! cloud_agent_vo5c_validate_operator_session_file_metadata "${SESSION_FILE}.link" && pass session_symlink_reject
chmod 644 "$SESSION_FILE"
! cloud_agent_vo5c_parse_operator_session_file "$SESSION_FILE" "$HEAD_SHA" && pass session_mode_reject
chmod 600 "$SESSION_FILE"
write_session "$SESSION_FILE" "$HEAD_SHA" "$until"
echo 'MALICIOUS=$(id)' >>"$SESSION_FILE"
! cloud_agent_vo5c_parse_operator_session_file "$SESSION_FILE" "$HEAD_SHA" && pass session_unknown_key_reject

WT_PIN="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_PIN" "$HEAD_SHA" >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_PIN" 2>/dev/null || rm -rf "$WT_PIN"; rm -rf "$ROOT_T"' EXIT

PIN_FILE="${ROOT_T}/pin.env"
cat >"$PIN_FILE" <<EOF
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PIN}
SYNQDRIVE_PINNED_EXECUTOR_SHA=${HEAD_SHA}
EOF

AUTH_OFF="${ROOT_T}/auth-off.env"
echo 'VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0' >"$AUTH_OFF"
AUTH_ON="${ROOT_T}/auth-on.env"
cat >"$AUTH_ON" <<EOF
VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PIN}
SYNQDRIVE_PINNED_EXECUTOR_SHA=${HEAD_SHA}
EOF
AUTH_BAD="${ROOT_T}/auth-bad.env"
echo 'VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=maybe' >"$AUTH_BAD"

cloud_agent_vo5c_invoke_pinned_runner_hook() {
  echo "MOCK_RUNNER_INVOKED"
  return 0
}

write_session "${ROOT_T}/sess-ok" "$HEAD_SHA" "$until"
set +e
out=$(cloud_agent_vo5c_run_remote_pinned_deploy "$HEAD_SHA" "$PIN_FILE" "${ROOT_T}/sess-ok" "$AUTH_OFF" "$ARMED" "" 2>&1)
rc=$?
set -e
[[ "$rc" -eq 0 ]] && echo "$out" | grep -q MOCK_RUNNER_INVOKED && pass enforcement_off_pinned_ok || fail "enforcement_off_pinned_ok rc=${rc} out=${out}"

write_session "${ROOT_T}/sess-on" "$HEAD_SHA" "$until"
set +e
out=$(cloud_agent_vo5c_run_remote_pinned_deploy "$HEAD_SHA" "$PIN_FILE" "${ROOT_T}/sess-on" "$AUTH_ON" "$ARMED" "" 2>&1)
rc=$?
set -e
[[ "$rc" -eq 0 ]] && echo "$out" | grep -q 'enforcement ACTIVE' && pass enforcement_on_pinned_ok || fail "enforcement_on_pinned_ok rc=${rc}"

set +e
rc_bad=$(cloud_agent_vo5c_run_remote_pinned_deploy "$HEAD_SHA" "$PIN_FILE" "${ROOT_T}/sess-on" "$AUTH_BAD" "$ARMED" "" 2>/dev/null)
set -e
[[ "$rc_bad" -ne 0 ]] && pass invalid_authority_reject

rm -f "$AUTH_OFF"
touch "${ROOT_T}/armed-stamp"
! cloud_agent_vo5c_load_authority_state "$AUTH_OFF" "${ROOT_T}/armed-stamp" && pass missing_authority_after_armed

echo 'VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0' >"${ROOT_T}/auth-off.env"
write_session "${ROOT_T}/sess-miss" "$HEAD_SHA" "$until"
rm -f "${ROOT_T}/sess-miss"
set +e
cloud_agent_vo5c_run_remote_pinned_deploy "$HEAD_SHA" "$PIN_FILE" "${ROOT_T}/sess-miss" "${ROOT_T}/auth-off.env" "$ARMED" "" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 42 ]] && pass missing_auth_exit_42 || fail "missing_auth_exit_42 rc=${rc}"

STAGED_TEST="${ROOT_T}/staged2"
mkdir -p "$STAGED_TEST"
git clone -q "$REPO_ROOT" "$STAGED_TEST"
git -C "$STAGED_TEST" checkout -q "$HEAD_SHA"
actual=$(git -C "$STAGED_TEST" rev-parse HEAD)
[[ "$(echo "$actual" | tr '[:upper:]' '[:lower:]')" == "$(echo "$HEAD_SHA" | tr '[:upper:]' '[:lower:]')" ]] && pass staged_fixture_exact_sha

set +e
cloud_agent_vo5c_prepare_staged_release_checkout "${ROOT_T}/staged-missing" "$SHA_B" >/dev/null 2>&1
rc_stg=$?
set -e
[[ "$rc_stg" -ne 0 ]] && pass staged_preflight_failure_fail_closed || fail staged_preflight

write_session "${ROOT_T}/sess-revoke" "$HEAD_SHA" "$until"
cloud_agent_vo5c_revoke_operator_session_file "${ROOT_T}/sess-revoke"
[[ ! -f "${ROOT_T}/sess-revoke" ]] && pass session_revoke

grep -q 'SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC:-4' "${REPO_ROOT}/backend/scripts/ops/vps-deploy-release.sh" && pass monitoring_exit_4_stable

echo "ALL_CLOUD_AGENT_REMOTE_SELFTEST_PASS"
